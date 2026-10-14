package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"

	"github.com/leraptor65/simple-data-flow/api"
	"github.com/leraptor65/simple-data-flow/watcher"
)

var db *sql.DB

func main() {
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "/app/data"
	}
	os.MkdirAll(dataDir, 0755)

	initDB(dataDir)
	defer db.Close()

	verifyGitIntegration()

	r := chi.NewRouter()

	// Basic middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// CORS — configurable via CORS_ORIGINS env var (comma-separated)
	corsOrigins := os.Getenv("CORS_ORIGINS")
	var allowedOrigins []string
	if corsOrigins != "" {
		allowedOrigins = strings.Split(corsOrigins, ",")
		for i, o := range allowedOrigins {
			allowedOrigins[i] = strings.TrimSpace(o)
		}
	} else {
		allowedOrigins = []string{"*"}
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-authentik-username", "Remote-User", "X-Forwarded-User"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Setup API & Auth
	a := api.NewAPI(db, dataDir)
	r.Use(a.AuthMiddleware)
	a.RegisterRoutes(r)

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("OK"))
	})

	// Start Watcher
	w := watcher.NewWatcher(db, dataDir)
	w.Start()

	port := os.Getenv("BACKEND_PORT")
	if port == "" {
		port = os.Getenv("PORT")
	}
	if port == "" || port == "3000" {
		port = "8080"
	}

	log.Printf("Server listening on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func initDB(dataDir string) {
	dbDriver := os.Getenv("DB_DRIVER")
	dbHost := os.Getenv("DB_HOST")

	// If Postgres is explicitly requested via DB_DRIVER=postgres or non-empty DB_HOST
	if dbDriver == "postgres" || (dbDriver == "" && dbHost != "") {
		initPostgres()
		return
	}

	initSQLite(dataDir)
}

func initSQLite(dataDir string) {
	dbPath := filepath.Join(dataDir, ".asdf.db")
	log.Printf("Connecting to embedded SQLite database at: %s", dbPath)

	var err error
	db, err = sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)")
	if err != nil {
		log.Fatalf("Error opening SQLite database: %v", err)
	}

	if err = db.Ping(); err != nil {
		log.Fatalf("Error connecting to SQLite database: %v", err)
	}

	createSQLiteSchema(db)
	log.Println("SQLite database initialized successfully.")
}

func createSQLiteSchema(db *sql.DB) {
	schema := `
	CREATE TABLE IF NOT EXISTS notes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		filename TEXT UNIQUE NOT NULL,
		title TEXT,
		frontmatter TEXT DEFAULT '{}',
		content TEXT,
		is_pinned INTEGER NOT NULL DEFAULT 0,
		last_modified DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_notes_filename ON notes(filename);
	CREATE INDEX IF NOT EXISTS idx_notes_is_pinned ON notes(is_pinned);

	CREATE TABLE IF NOT EXISTS links (
		source_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
		target_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
		PRIMARY KEY (source_id, target_id)
	);

	CREATE TABLE IF NOT EXISTS shared_links (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		token TEXT UNIQUE NOT NULL,
		filename TEXT NOT NULL,
		expires_at DATETIME NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS auth_sessions (
		token TEXT PRIMARY KEY,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		expires_at DATETIME NOT NULL
	);

	CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
		filename,
		title,
		content,
		content='notes',
		content_rowid='id'
	);

	CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
		INSERT INTO notes_fts(rowid, filename, title, content) VALUES (new.id, new.filename, new.title, new.content);
	END;

	CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
		INSERT INTO notes_fts(notes_fts, rowid, filename, title, content) VALUES('delete', old.id, old.filename, old.title, old.content);
	END;

	CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
		INSERT INTO notes_fts(notes_fts, rowid, filename, title, content) VALUES('delete', old.id, old.filename, old.title, old.content);
		INSERT INTO notes_fts(rowid, filename, title, content) VALUES (new.id, new.filename, new.title, new.content);
	END;
	`
	_, err := db.Exec(schema)
	if err != nil {
		log.Printf("Error creating SQLite schema: %v", err)
	}
}

func initPostgres() {
	host := os.Getenv("DB_HOST")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")
	sslmode := os.Getenv("DB_SSLMODE")

	if host == "" {
		host = "localhost"
	}
	if user == "" {
		user = "appuser"
	}
	if password == "" {
		log.Fatal("DB_PASSWORD environment variable is required for Postgres")
	}
	if dbname == "" {
		dbname = "notesdb"
	}
	if sslmode == "" {
		sslmode = "disable"
	}

	connStr := fmt.Sprintf("host=%s user=%s password=%s dbname=%s sslmode=%s", host, user, password, dbname, sslmode)

	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Error connecting to database: %v", err)
	}

	for i := 0; i < 30; i++ {
		err = db.Ping()
		if err == nil {
			log.Println("Successfully connected to Postgres!")
			break
		}
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("Could not connect to Postgres: %v", err)
	}

	createPostgresSchema(db)
}

func createPostgresSchema(db *sql.DB) {
	schema := `
	CREATE TABLE IF NOT EXISTS notes (
		id SERIAL PRIMARY KEY,
		filename TEXT UNIQUE NOT NULL,
		title TEXT,
		frontmatter JSONB,
		content TEXT,
		is_pinned INTEGER NOT NULL DEFAULT 0,
		content_vector tsvector,
		last_modified TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS notes_content_vector_idx ON notes USING GIN(content_vector);

	CREATE TABLE IF NOT EXISTS links (
		source_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
		target_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
		PRIMARY KEY (source_id, target_id)
	);

	CREATE TABLE IF NOT EXISTS shared_links (
		id SERIAL PRIMARY KEY,
		token TEXT UNIQUE NOT NULL,
		filename TEXT NOT NULL,
		expires_at TIMESTAMP NULL,
		created_at TIMESTAMP NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS auth_sessions (
		token TEXT PRIMARY KEY,
		created_at TIMESTAMP NOT NULL DEFAULT NOW(),
		expires_at TIMESTAMP NOT NULL
	);
	`
	db.Exec(schema)
}

func verifyGitIntegration() {
	repo := os.Getenv("GITHUB_REPO")
	token := os.Getenv("GITHUB_TOKEN")

	if repo == "" {
		log.Println("GitHub Sync: optional GitHub integration is disabled (GITHUB_REPO not set).")
		return
	}

	if token == "" {
		log.Printf("GitHub Sync: WARNING: GITHUB_REPO is set to %s, but GITHUB_TOKEN is missing. Automatic remote sync will fail until a token is set.", repo)
		return
	}

	authorName := os.Getenv("GIT_AUTHOR_NAME")
	if authorName == "" {
		authorName = "App User"
	}
	authorEmail := os.Getenv("GIT_AUTHOR_EMAIL")
	if authorEmail == "" {
		authorEmail = "app@local"
	}

	log.Printf("GitHub Sync: enabled for repository %s (author: %s <%s>)", repo, authorName, authorEmail)
}

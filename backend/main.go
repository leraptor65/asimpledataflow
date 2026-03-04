package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	_ "github.com/lib/pq"

	"github.com/leraptor65/simple-data-flow/api"
	"github.com/leraptor65/simple-data-flow/watcher"
)

var db *sql.DB

func main() {
	initDB()
	defer db.Close()

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
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "/app/data"
	}
	os.MkdirAll(dataDir, 0755)

	// Start Watcher
	w := watcher.NewWatcher(db, dataDir)
	w.Start()

	// Setup API
	a := api.NewAPI(db, dataDir)
	a.RegisterRoutes(r)

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("OK"))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server listening on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func initDB() {
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
		log.Fatal("DB_PASSWORD environment variable is required")
	}
	if dbname == "" {
		dbname = "notesdb"
	}
	if sslmode == "" {
		sslmode = "disable"
		log.Println("WARNING: DB_SSLMODE not set, defaulting to 'disable'. Set DB_SSLMODE=require for production.")
	}

	connStr := fmt.Sprintf("host=%s user=%s password=%s dbname=%s sslmode=%s", host, user, password, dbname, sslmode)

	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Error connecting to database: %v", err)
	}

	// Retry connecting to Postgres until it's ready (up to 30 attempts)
	for i := 0; i < 30; i++ {
		err = db.Ping()
		if err == nil {
			log.Println("Successfully connected to Postgres!")
			break
		}
		log.Printf("Waiting for Postgres to be ready (attempt %d/30): %v", i+1, err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("Could not connect to Postgres after 30 attempts: %v", err)
	}

	createSchema(db)
}

func createSchema(db *sql.DB) {
	schema := `
	CREATE TABLE IF NOT EXISTS notes (
		id SERIAL PRIMARY KEY,
		filename TEXT UNIQUE NOT NULL,
		title TEXT,
		frontmatter JSONB,
		content TEXT,
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
	`
	_, err := db.Exec(schema)
	if err != nil {
		log.Printf("Error creating schema: %v", err)
	} else {
		log.Println("Database schema initialized.")
	}
}

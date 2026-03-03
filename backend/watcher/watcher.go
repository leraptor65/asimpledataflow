package watcher

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/fsnotify/fsnotify"
)

type Watcher struct {
	db      *sql.DB
	dataDir string
}

func NewWatcher(db *sql.DB, dataDir string) *Watcher {
	return &Watcher{
		db:      db,
		dataDir: dataDir,
	}
}

func (w *Watcher) Start() {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatalf("Error creating watcher: %v", err)
	}
	// defer watcher.Close() -> Should run in background

	go func() {
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}

				// Handle new directories being created
				if event.Has(fsnotify.Create) {
					info, err := os.Stat(event.Name)
					if err == nil && info.IsDir() {
						watcher.Add(event.Name)
						log.Println("Added new watched directory:", event.Name)
						continue
					}
				}

				if event.Has(fsnotify.Write) || event.Has(fsnotify.Create) {
					if strings.HasSuffix(event.Name, ".md") {
						log.Println("Modified file:", event.Name)
						w.ProcessFile(event.Name)
					}
				} else if event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) {
					if strings.HasSuffix(event.Name, ".md") {
						log.Println("Removed file:", event.Name)
						w.RemoveFile(event.Name)
					}
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Println("error:", err)
			}
		}
	}()

	// Initial scan and watch all directories
	filepath.Walk(w.dataDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		// Skip hidden directories like .git
		if info.IsDir() && strings.HasPrefix(info.Name(), ".") && info.Name() != "." {
			return filepath.SkipDir
		}

		if info.IsDir() {
			err = watcher.Add(path)
			if err != nil {
				log.Printf("Error adding watcher directory %s: %v", path, err)
			}
		} else if strings.HasSuffix(path, ".md") {
			w.ProcessFile(path)
		}
		return nil
	})

	log.Printf("Started recursively watching %s for changes", w.dataDir)
}

func (w *Watcher) ProcessFile(path string) {
	contentBytes, err := os.ReadFile(path)
	if err != nil {
		log.Printf("Error reading file %s: %v", path, err)
		return
	}

	content := string(contentBytes)

	// Use relative path for database filename
	relPath, err := filepath.Rel(w.dataDir, path)
	if err != nil {
		relPath = filepath.Base(path)
	}

	filename := relPath
	title := strings.TrimSuffix(filepath.Base(path), ".md")

	lines := strings.Split(content, "\n")
	if len(lines) > 0 {
		firstLine := strings.TrimSpace(lines[0])
		if strings.HasPrefix(firstLine, "# ") {
			title = strings.TrimSpace(strings.TrimPrefix(firstLine, "#"))
		}
	}

	// Basic implementation - wait for full frontmatter parser

	_, err = w.db.Exec(`
		INSERT INTO notes (filename, title, content, content_vector, last_modified) 
		VALUES ($1, $2, $3, to_tsvector('english', $3), NOW())
		ON CONFLICT (filename) 
		DO UPDATE SET 
			title = EXCLUDED.title,
			content = EXCLUDED.content,
			content_vector = to_tsvector('english', EXCLUDED.content),
			last_modified = NOW()
	`, filename, title, content)

	if err != nil {
		log.Printf("Error upserting note %s: %v", path, err)
	}
}

func (w *Watcher) RemoveFile(path string) {
	relPath, err := filepath.Rel(w.dataDir, path)
	if err != nil {
		relPath = filepath.Base(path)
	}
	filename := relPath
	_, err = w.db.Exec("DELETE FROM notes WHERE filename = $1", filename)
	if err != nil {
		log.Printf("Error deleting note %s: %v", path, err)
	}
}

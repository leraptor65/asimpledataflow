package watcher

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"
	"regexp"
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

var wikiLinkRegex = regexp.MustCompile(`\[\[([^\]]+)\]\]`)

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
					log.Println("Removed/Renamed path:", event.Name)
					w.RemoveFile(event.Name)
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Println("error:", err)
			}
		}
	}()

	// Perform initial scan and prune any deleted notes from database
	SyncDatabaseWithDisk(w.db, w.dataDir)

	// Watch all active directories
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
		return
	}

	// Index wiki-links: parse [[...]] references and update links table
	w.indexWikiLinks(filename, content)
}

func (w *Watcher) indexWikiLinks(sourceFilename string, content string) {
	// Get source note ID
	var sourceID int
	err := w.db.QueryRow("SELECT id FROM notes WHERE filename = $1", sourceFilename).Scan(&sourceID)
	if err != nil {
		return
	}

	// Delete old links from this source
	w.db.Exec("DELETE FROM links WHERE source_id = $1", sourceID)

	// Find all [[...]] references
	matches := wikiLinkRegex.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return
	}

	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		targetName := match[1]

		// Try to find the target note by matching filename patterns
		// Search for exact filename match, with or without .md, with or without path
		var targetID int
		err := w.db.QueryRow(`
			SELECT id FROM notes WHERE 
				filename = $1 OR 
				filename = $2 OR 
				filename LIKE '%/' || $2
		`, targetName, targetName+".md").Scan(&targetID)

		if err == nil && targetID != sourceID {
			w.db.Exec(
				"INSERT INTO links (source_id, target_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
				sourceID, targetID,
			)
		}
	}
}

func (w *Watcher) RemoveFile(path string) {
	relPath, err := filepath.Rel(w.dataDir, path)
	if err != nil {
		relPath = filepath.Base(path)
	}
	filename := relPath
	
	// If filename ends with .md, delete it specifically.
	// Otherwise (e.g. folder moved/deleted), delete all entries starting with the folder name
	if strings.HasSuffix(filename, ".md") {
		_, err = w.db.Exec("DELETE FROM notes WHERE filename = $1", filename)
	} else {
		_, err = w.db.Exec("DELETE FROM notes WHERE filename = $1 OR filename LIKE $2", filename, filename+"/%")
	}
	if err != nil {
		log.Printf("Error deleting note/folder %s: %v", path, err)
	}
}

func SyncDatabaseWithDisk(db *sql.DB, dataDir string) {
	log.Println("Database Sync: scanning disk to prune deleted notes and index active ones...")
	
	// 1. Walk the filesystem to collect all current markdown files
	diskFiles := make(map[string]bool)
	err := filepath.Walk(dataDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		// Skip hidden files/directories
		if info.IsDir() && strings.HasPrefix(info.Name(), ".") && info.Name() != "." {
			return filepath.SkipDir
		}
		if !info.IsDir() && strings.HasSuffix(info.Name(), ".md") {
			relPath, err := filepath.Rel(dataDir, path)
			if err == nil {
				diskFiles[relPath] = true
			}
		}
		return nil
	})
	if err != nil {
		log.Printf("Database Sync: error walking directory: %v", err)
		return
	}

	// 2. Fetch all tracked notes from the database
	rows, err := db.Query("SELECT filename FROM notes")
	if err != nil {
		log.Printf("Database Sync: query error: %v", err)
		return
	}
	defer rows.Close()

	var toDelete []string
	for rows.Next() {
		var filename string
		if err := rows.Scan(&filename); err == nil {
			if !diskFiles[filename] {
				toDelete = append(toDelete, filename)
			}
		}
	}

	// 3. Delete stale rows
	for _, filename := range toDelete {
		log.Printf("Database Sync: pruning stale record: %s", filename)
		_, err = db.Exec("DELETE FROM notes WHERE filename = $1", filename)
		if err != nil {
			log.Printf("Database Sync: delete error for %s: %v", filename, err)
		}
	}

	// 4. Index active files to ensure they are synchronized
	w := NewWatcher(db, dataDir)
	for relPath := range diskFiles {
		fullPath := filepath.Join(dataDir, relPath)
		w.ProcessFile(fullPath)
	}
	
	log.Printf("Database Sync: complete! Pruned %d stale rows, validated %d active files.", len(toDelete), len(diskFiles))
}

package api

import (
	"archive/zip"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	gitHttp "github.com/go-git/go-git/v5/plumbing/transport/http"
	"github.com/leraptor65/simple-data-flow/gitops"
	"github.com/leraptor65/simple-data-flow/models"
	"github.com/leraptor65/simple-data-flow/watcher"
)

const maxJSONBodySize = 1 << 20     // 1 MB
const maxImageUploadSize = 10 << 20 // 10 MB

var validGitHash = regexp.MustCompile(`^[0-9a-f]{4,40}$`)

// safePath validates that a user-supplied relative path resolves within baseDir.
// Returns the cleaned absolute path or an error if traversal is detected.
func safePath(baseDir, userPath string) (string, error) {
	// Clean the user path to remove any ../ or ./ components
	cleaned := filepath.Clean(userPath)
	// Reject absolute paths or paths that escape via ..
	if filepath.IsAbs(cleaned) || strings.HasPrefix(cleaned, "..") {
		return "", fmt.Errorf("invalid path")
	}
	full := filepath.Join(baseDir, cleaned)
	// Double-check the resolved path is within baseDir
	if !strings.HasPrefix(full, filepath.Clean(baseDir)+string(os.PathSeparator)) && full != filepath.Clean(baseDir) {
		return "", fmt.Errorf("invalid path")
	}
	return full, nil
}

// sanitizeFilename strips directory components and rejects dangerous filenames.
func sanitizeFilename(name string) string {
	// Use path.Base (not filepath.Base) to handle both / and \ separators
	clean := path.Base(name)
	if clean == "." || clean == ".." || clean == "/" {
		return ""
	}
	return clean
}

// setJSON sets the Content-Type header to application/json.
func setJSON(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
}

// limitBody wraps the request body with a max byte reader.
func limitBody(r *http.Request, maxBytes int64) {
	r.Body = http.MaxBytesReader(nil, r.Body, maxBytes)
}

type TreeItem struct {
	Name         string      `json:"name"`
	Path         string      `json:"path"`
	Type         string      `json:"type"` // "file" or "folder"
	LastModified string      `json:"lastModified"`
	Children     []*TreeItem `json:"children,omitempty"`
}

type API struct {
	db      *sql.DB
	dataDir string
}

func NewAPI(db *sql.DB, dataDir string) *API {
	return &API{
		db:      db,
		dataDir: dataDir,
	}
}

func (a *API) RegisterRoutes(r chi.Router) {
	r.Get("/api/notes", a.HandleListNotes)
	r.Get("/api/notes/*", a.HandleGetNote)
	r.Post("/api/notes/*", a.HandleSaveNote)
	r.Get("/api/search", a.HandleSearchNotes)
	r.Get("/api/raw/*", a.HandleServeRawFile)
	r.Post("/api/upload", a.HandleUploadImage)
	r.Post("/api/upload/file", a.HandleUploadFile)
	r.Post("/api/folders", a.HandleCreateFolder)
	r.Put("/api/move", a.HandleMoveItem)
	r.Delete("/api/delete", a.HandleDeleteItem)
	r.Get("/api/tree", a.HandleGetTree)
	r.Post("/api/sync", a.HandleSyncDatabase)
	r.Get("/api/history", a.HandleGetHistory)
	r.Get("/api/history/content", a.HandleGetHistoryContent)
	r.Post("/api/revert", a.HandleRevertFile)

	r.Get("/api/recycle-bin", a.HandleGetRecycleBin)
	r.Post("/api/recycle-bin/restore", a.HandleRestoreRecycledItem)
	r.Delete("/api/recycle-bin/permanent", a.HandleDeleteRecycledItemPermanent)

	r.Get("/api/export", a.HandleExportVault)
	r.Post("/api/import", a.HandleImportVault)

	// Shared links
	r.Post("/api/share", a.HandleCreateShareLink)
	r.Get("/api/shares", a.HandleListShareLinks)
	r.Delete("/api/share/{token}", a.HandleRevokeShareLink)
	r.Put("/api/share/{token}", a.HandleUpdateShareLink)
	r.Get("/api/shared/{token}", a.HandleViewSharedNote)
	r.Get("/api/shared/{token}/linked/{filename}", a.HandleViewSharedLinkedNote)
	r.Get("/api/shared/{token}/images/*", a.HandleServeSharedImage)

	// Image serving
	r.Get("/images/*", a.HandleServeImage)



	// Image gallery management
	r.Get("/api/images", a.HandleListImages)
	r.Delete("/api/images/{name}", a.HandleDeleteImage)

	// Backlinks
	r.Get("/api/backlinks", a.HandleGetBacklinks)

	// Note Pinning
	r.Post("/api/notes/pin", a.HandlePinNote)

	// Authentication routes
	r.Get("/api/auth/status", a.HandleAuthStatus)
	r.Post("/api/auth/login", a.HandleAuthLogin)
	r.Post("/api/auth/logout", a.HandleAuthLogout)

	// Git status info for Settings
	r.Get("/api/git/status", a.HandleGetGitStatus)
	r.Post("/api/git/toggle", a.HandleToggleGitSync)
	r.Post("/api/git/check", a.HandleCheckGitConnection)
	r.Post("/api/git/push", a.HandleGitPushAll)
	r.Get("/api/version", a.HandleGetVersion)
}

func detectFileType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".pdf":
		return "pdf"
	case ".html", ".htm":
		return "html"
	case ".txt":
		return "text"
	default:
		return "markdown"
	}
}

func (a *API) HandleListNotes(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query("SELECT id, filename, title, COALESCE(frontmatter, '{}'), content, is_pinned, last_modified FROM notes ORDER BY is_pinned DESC, filename ASC")
	if err != nil {
		log.Printf("HandleListNotes: %v", err)
		http.Error(w, "Failed to list notes", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var notes []models.Note
	for rows.Next() {
		var n models.Note
		if err := rows.Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.Content, &n.IsPinned, &n.LastModified); err != nil {
			continue
		}
		n.FileType = detectFileType(n.Filename)
		n.RawURL = "/api/raw/" + n.Filename
		notes = append(notes, n)
	}

	if notes == nil {
		notes = []models.Note{}
	}

	setJSON(w)
	json.NewEncoder(w).Encode(notes)
}

func (a *API) HandleGetNote(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "*")
	if filename == "" {
		filename = chi.URLParam(r, "filename")
	}
	filename, _ = url.PathUnescape(filename)

	var n models.Note
	err := a.db.QueryRow("SELECT id, filename, title, COALESCE(frontmatter, '{}'), content, is_pinned, last_modified FROM notes WHERE filename = ?", filename).
		Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.Content, &n.IsPinned, &n.LastModified)

	ext := strings.ToLower(filepath.Ext(filename))
	if err == sql.ErrNoRows {
		// Try falling back to disk if watcher hasn't caught it yet
		path, pathErr := safePath(a.dataDir, filename)
		if pathErr != nil {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}
		info, statErr := os.Stat(path)
		if statErr != nil {
			http.Error(w, "Note not found", http.StatusNotFound)
			return
		}

		n.Filename = filename
		n.LastModified = info.ModTime()
		if ext == ".pdf" {
			n.Title = strings.TrimSuffix(filepath.Base(filename), ".pdf")
			n.Content = ""
		} else {
			content, err := os.ReadFile(path)
			if err != nil {
				http.Error(w, "Note not found", http.StatusNotFound)
				return
			}
			n.Content = string(content)
			n.Title = strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename))
		}
	} else if err != nil {
		log.Printf("HandleGetNote: %v", err)
		http.Error(w, "Failed to get note", http.StatusInternalServerError)
		return
	}

	if ext == ".pdf" {
		n.Content = ""
	}
	n.FileType = detectFileType(n.Filename)
	n.RawURL = "/api/raw/" + n.Filename

	setJSON(w)
	json.NewEncoder(w).Encode(n)
}

func (a *API) HandleSaveNote(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "*")
	if filename == "" {
		filename = chi.URLParam(r, "filename")
	}
	filename, _ = url.PathUnescape(filename)

	ext := strings.ToLower(filepath.Ext(filename))
	if ext == ".pdf" {
		http.Error(w, "PDF files cannot be edited as text directly", http.StatusBadRequest)
		return
	}

	limitBody(r, maxJSONBodySize)
	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	path, err := safePath(a.dataDir, filename)
	if err != nil {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("HandleSaveNote mkdir: %v", err)
		http.Error(w, "Failed to create directory", http.StatusInternalServerError)
		return
	}

	if writeErr := os.WriteFile(path, []byte(req.Content), 0644); writeErr != nil {
		log.Printf("HandleSaveNote: %v", writeErr)
		http.Error(w, "Failed to save note", http.StatusInternalServerError)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	git.CommitAll("Update " + filename)
	watcher.SyncDatabaseWithDisk(a.db, a.dataDir)

	w.WriteHeader(http.StatusOK)
}

func sanitizeFTSQuery(q string) string {
	words := strings.Fields(q)
	var escaped []string
	for _, w := range words {
		clean := strings.ReplaceAll(w, `"`, `""`)
		if clean != "" {
			escaped = append(escaped, `"`+clean+`"*`)
		}
	}
	if len(escaped) == 0 {
		return `""`
	}
	return strings.Join(escaped, " ")
}

func (a *API) HandleSearchNotes(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "Query parameter 'q' is required", http.StatusBadRequest)
		return
	}

	likeQuery := "%" + query + "%"
	ftsQuery := sanitizeFTSQuery(query)

	rows, err := a.db.Query(`
		SELECT id, filename, title, COALESCE(frontmatter, '{}'), content, is_pinned, last_modified
		FROM notes
		WHERE id IN (
			SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?
		)
		OR filename LIKE ?
		OR content LIKE ?
		ORDER BY is_pinned DESC, (filename LIKE ?) DESC, last_modified DESC
	`, ftsQuery, likeQuery, likeQuery, likeQuery)

	if err != nil {
		rows, err = a.db.Query(`
			SELECT id, filename, title, COALESCE(frontmatter, '{}'), content, is_pinned, last_modified
			FROM notes
			WHERE filename LIKE ? OR content LIKE ?
			ORDER BY is_pinned DESC, (filename LIKE ?) DESC, last_modified DESC
		`, likeQuery, likeQuery, likeQuery)
	}

	if err != nil {
		log.Printf("HandleSearchNotes: %v", err)
		http.Error(w, "Search failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var notes []models.Note
	for rows.Next() {
		var n models.Note
		err := rows.Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.Content, &n.IsPinned, &n.LastModified)
		if err == nil {
			n.FileType = detectFileType(n.Filename)
			n.RawURL = "/api/raw/" + n.Filename
			notes = append(notes, n)
		}
	}

	if notes == nil {
		notes = []models.Note{}
	}

	setJSON(w)
	json.NewEncoder(w).Encode(notes)
}

func (a *API) HandlePinNote(w http.ResponseWriter, r *http.Request) {
	limitBody(r, maxJSONBodySize)
	var req struct {
		Filename string `json:"filename"`
		Pinned   bool   `json:"pinned"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	val := 0
	if req.Pinned {
		val = 1
	}
	_, err := a.db.Exec("UPDATE notes SET is_pinned = ? WHERE filename = ?", val, req.Filename)
	if err != nil {
		log.Printf("HandlePinNote: %v", err)
		http.Error(w, "Failed to update pin status", http.StatusInternalServerError)
		return
	}

	setJSON(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"filename": req.Filename,
		"pinned":   req.Pinned,
	})
}

func (a *API) HandleUploadImage(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxImageUploadSize)
	file, handler, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "Error retrieving image", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Sanitize filename — strip any directory components
	safeFilename := sanitizeFilename(handler.Filename)
	if safeFilename == "" {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	// Validate file extension
	ext := strings.ToLower(filepath.Ext(safeFilename))
	allowedExts := map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".svg": true, ".bmp": true}
	if !allowedExts[ext] {
		http.Error(w, "File type not allowed", http.StatusBadRequest)
		return
	}

	imagesDir := filepath.Join(a.dataDir, ".images")
	os.MkdirAll(imagesDir, 0755)

	dstPath := filepath.Join(imagesDir, safeFilename)
	dst, err := os.Create(dstPath)
	if err != nil {
		log.Printf("HandleUploadImage: %v", err)
		http.Error(w, "Error saving file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		log.Printf("HandleUploadImage write: %v", err)
		http.Error(w, "Error writing file", http.StatusInternalServerError)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	git.CommitFile(filepath.Join(".images", safeFilename), "Upload image "+safeFilename)

	setJSON(w)
	json.NewEncoder(w).Encode(map[string]string{
		"url": "/images/" + safeFilename,
	})
}

func (a *API) HandleCreateFolder(w http.ResponseWriter, r *http.Request) {
	limitBody(r, maxJSONBodySize)
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	fullPath, err := safePath(a.dataDir, req.Path)
	if err != nil {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	if mkErr := os.MkdirAll(fullPath, 0755); mkErr != nil {
		log.Printf("HandleCreateFolder: %v", mkErr)
		http.Error(w, "Failed to create folder", http.StatusInternalServerError)
		return
	}

	// Create a .gitkeep to ensure the folder is tracked
	gitkeepPath := filepath.Join(fullPath, ".gitkeep")
	os.WriteFile(gitkeepPath, []byte(""), 0644)

	git := gitops.NewGitManager(a.dataDir)
	git.CommitFile(filepath.Join(req.Path, ".gitkeep"), "Create folder "+req.Path)

	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleMoveItem(w http.ResponseWriter, r *http.Request) {
	limitBody(r, maxJSONBodySize)
	var req struct {
		Source      string `json:"source"`
		Destination string `json:"destination"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	srcPath, err := safePath(a.dataDir, req.Source)
	if err != nil {
		http.Error(w, "Invalid source path", http.StatusBadRequest)
		return
	}
	destPath, err := safePath(a.dataDir, req.Destination)
	if err != nil {
		http.Error(w, "Invalid destination path", http.StatusBadRequest)
		return
	}

	if renameErr := os.Rename(srcPath, destPath); renameErr != nil {
		log.Printf("HandleMoveItem: %v", renameErr)
		http.Error(w, "Failed to move item", http.StatusInternalServerError)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	git.CommitAll("Move " + req.Source + " to " + req.Destination)
	watcher.SyncDatabaseWithDisk(a.db, a.dataDir)

	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleDeleteItem(w http.ResponseWriter, r *http.Request) {
	limitBody(r, maxJSONBodySize)
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	sourcePath, err := safePath(a.dataDir, req.Path)
	if err != nil {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	recyclePath := filepath.Join(a.dataDir, ".recycle_bin")
	if err := os.MkdirAll(recyclePath, 0755); err != nil {
		log.Printf("HandleDeleteItem: %v", err)
		http.Error(w, "Failed to delete item", http.StatusInternalServerError)
		return
	}

	destPath := filepath.Join(recyclePath, filepath.Base(req.Path))

	// Move file/folder to recycle bin
	if err := os.Rename(sourcePath, destPath); err != nil {
		log.Printf("HandleDeleteItem move: %v", err)
		http.Error(w, "Failed to delete item", http.StatusInternalServerError)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	git.CommitAll("Moved " + req.Path + " to .recycle_bin")
	watcher.SyncDatabaseWithDisk(a.db, a.dataDir)

	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleGetTree(w http.ResponseWriter, r *http.Request) {
	root := &TreeItem{
		Name:         "root",
		Path:         "",
		Type:         "folder",
		LastModified: "",
		Children:     []*TreeItem{},
	}

	err := filepath.Walk(a.dataDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		relPath, err := filepath.Rel(a.dataDir, path)
		if err != nil || relPath == "." {
			return nil
		}

		if info.IsDir() && (strings.HasPrefix(info.Name(), ".") || info.Name() == "images") {
			return filepath.SkipDir
		}

		// Skip hidden files like .gitkeep or anything in .recycle_bin
		if !info.IsDir() && strings.HasPrefix(info.Name(), ".") {
			return nil
		}
		if strings.HasPrefix(relPath, ".recycle_bin") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		// Also skip files that aren't supported notes
		if !info.IsDir() && !watcher.IsSupportedNoteFile(info.Name()) {
			return nil
		}

		// Find parent folder in our tree
		parts := strings.Split(relPath, string(os.PathSeparator))
		current := root
		currentPath := ""
		for i, part := range parts {
			if currentPath == "" {
				currentPath = part
			} else {
				currentPath = currentPath + "/" + part
			}

			var found *TreeItem
			for _, child := range current.Children {
				if child.Name == part {
					found = child
					break
				}
			}

			if found == nil {
				itemType := "folder"
				if i == len(parts)-1 && !info.IsDir() {
					itemType = "file"
				}

				newItem := &TreeItem{
					Name:         part,
					Path:         currentPath,
					Type:         itemType,
					LastModified: info.ModTime().Format("2006-01-02T15:04:05Z07:00"),
					Children:     []*TreeItem{},
				}
				current.Children = append(current.Children, newItem)
				current = newItem
			} else {
				current = found
			}
		}

		return nil
	})

	if err != nil {
		log.Printf("HandleGetTree: %v", err)
		http.Error(w, "Failed to get tree", http.StatusInternalServerError)
		return
	}

	setJSON(w)
	json.NewEncoder(w).Encode(root.Children)
}

func (a *API) HandleGetHistory(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Query().Get("file")
	if filename == "" {
		http.Error(w, "file parameter is required", http.StatusBadRequest)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	commits, err := git.GetFileHistory(filename)
	if err != nil {
		log.Printf("HandleGetHistory: %v", err)
		http.Error(w, "Failed to get history", http.StatusInternalServerError)
		return
	}

	setJSON(w)
	json.NewEncoder(w).Encode(commits)
}

func (a *API) HandleRevertFile(w http.ResponseWriter, r *http.Request) {
	limitBody(r, maxJSONBodySize)
	var req struct {
		Hash     string `json:"hash"`
		Filename string `json:"filename"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if !validGitHash.MatchString(req.Hash) {
		http.Error(w, "Invalid hash", http.StatusBadRequest)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	err := git.CheckoutFile(req.Hash, req.Filename)
	if err != nil {
		log.Printf("HandleRevertFile: %v", err)
		http.Error(w, "Failed to revert file", http.StatusInternalServerError)
		return
	}
	watcher.SyncDatabaseWithDisk(a.db, a.dataDir)

	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleGetHistoryContent(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Query().Get("file")
	hash := r.URL.Query().Get("hash")

	if filename == "" || hash == "" {
		http.Error(w, "file and hash parameters are required", http.StatusBadRequest)
		return
	}

	if !validGitHash.MatchString(hash) {
		http.Error(w, "Invalid hash", http.StatusBadRequest)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	content, err := git.GetFileContentAtHash(hash, filename)
	if err != nil {
		log.Printf("HandleGetHistoryContent: %v", err)
		http.Error(w, "Failed to get content", http.StatusInternalServerError)
		return
	}

	w.Write([]byte(content))
}

func (a *API) HandleGetRecycleBin(w http.ResponseWriter, r *http.Request) {
	recyclePath := filepath.Join(a.dataDir, ".recycle_bin")
	if _, err := os.Stat(recyclePath); os.IsNotExist(err) {
		setJSON(w)
		json.NewEncoder(w).Encode([]TreeItem{})
		return
	}

	var items []TreeItem
	entries, err := os.ReadDir(recyclePath)
	if err != nil {
		log.Printf("HandleGetRecycleBin: %v", err)
		http.Error(w, "Failed to get recycle bin", http.StatusInternalServerError)
		return
	}

	for _, entry := range entries {
		itemType := "file"
		if entry.IsDir() {
			itemType = "folder"
		}
		items = append(items, TreeItem{
			Name: entry.Name(),
			Path: filepath.Join(".recycle_bin", entry.Name()),
			Type: itemType,
		})
	}

	setJSON(w)
	json.NewEncoder(w).Encode(items)
}

func (a *API) HandleRestoreRecycledItem(w http.ResponseWriter, r *http.Request) {
	limitBody(r, maxJSONBodySize)
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Sanitize: allow only a base filename, no path components
	safeName := sanitizeFilename(req.Name)
	if safeName == "" {
		http.Error(w, "Invalid name", http.StatusBadRequest)
		return
	}

	sourcePath := filepath.Join(a.dataDir, ".recycle_bin", safeName)
	destPath := filepath.Join(a.dataDir, safeName)

	if err := os.Rename(sourcePath, destPath); err != nil {
		log.Printf("HandleRestoreRecycledItem: %v", err)
		http.Error(w, "Failed to restore item", http.StatusInternalServerError)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	git.CommitAll("Restored " + safeName + " from .recycle_bin")
	watcher.SyncDatabaseWithDisk(a.db, a.dataDir)

	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleDeleteRecycledItemPermanent(w http.ResponseWriter, r *http.Request) {
	limitBody(r, maxJSONBodySize)
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Sanitize: allow only a base filename, no path components
	safeName := sanitizeFilename(req.Name)
	if safeName == "" {
		http.Error(w, "Invalid name", http.StatusBadRequest)
		return
	}

	targetPath := filepath.Join(a.dataDir, ".recycle_bin", safeName)
	if err := os.RemoveAll(targetPath); err != nil {
		log.Printf("HandleDeleteRecycledItemPermanent: %v", err)
		http.Error(w, "Failed to delete item", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleExportVault(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=\"vault-export.zip\"")

	zw := zip.NewWriter(w)
	defer zw.Close()

	filepath.Walk(a.dataDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, err := filepath.Rel(a.dataDir, path)
		if err != nil {
			return err
		}

		if relPath == "." || strings.HasPrefix(relPath, ".git") || strings.HasPrefix(relPath, ".recycle_bin") {
			return nil
		}

		if info.IsDir() {
			return nil
		}

		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()

		f, err := zw.Create(relPath)
		if err != nil {
			return err
		}

		_, err = io.Copy(f, file)
		return err
	})
}

func (a *API) HandleImportVault(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(50 << 20) // 50MB limit
	if err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Failed to get file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	tempFile, err := os.CreateTemp("", "import-*.zip")
	if err != nil {
		http.Error(w, "Failed to create temp file", http.StatusInternalServerError)
		return
	}
	defer os.Remove(tempFile.Name())
	defer tempFile.Close()

	if _, err := io.Copy(tempFile, file); err != nil {
		http.Error(w, "Failed to write temp file", http.StatusInternalServerError)
		return
	}

	fileInfo, _ := tempFile.Stat()

	zr, err := zip.NewReader(tempFile, fileInfo.Size())
	if err != nil {
		http.Error(w, "Failed to open zip", http.StatusBadRequest)
		return
	}

	for _, zf := range zr.File {
		relPath := filepath.Clean(zf.Name)
		// Stronger path traversal prevention
		if strings.HasPrefix(relPath, "..") || filepath.IsAbs(relPath) ||
			strings.HasPrefix(relPath, ".git") || strings.HasPrefix(relPath, ".recycle_bin") {
			continue
		}

		targetPath, err := safePath(a.dataDir, relPath)
		if err != nil {
			continue
		}

		if zf.FileInfo().IsDir() {
			os.MkdirAll(targetPath, os.ModePerm)
			continue
		}

		os.MkdirAll(filepath.Dir(targetPath), os.ModePerm)

		f, err := zf.Open()
		if err != nil {
			continue
		}

		targetFile, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, zf.Mode())
		if err != nil {
			f.Close()
			continue
		}

		io.Copy(targetFile, f)
		targetFile.Close()
		f.Close()
	}

	git := gitops.NewGitManager(a.dataDir)
	git.CommitAll("Vault imported from ZIP")
	watcher.SyncDatabaseWithDisk(a.db, a.dataDir)

	w.WriteHeader(http.StatusOK)
}

func generateToken(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}
	return string(b)
}

func (a *API) HandleCreateShareLink(w http.ResponseWriter, r *http.Request) {
	limitBody(r, maxJSONBodySize)
	var req struct {
		Filename  string `json:"filename"`
		ExpiresIn string `json:"expires_in"` // e.g. "24h", "7d", "never"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	token := generateToken(12)

	var expiresAt *time.Time
	if req.ExpiresIn != "never" && req.ExpiresIn != "" {
		duration, err := parseDuration(req.ExpiresIn)
		if err != nil {
			http.Error(w, "Invalid expires_in value", http.StatusBadRequest)
			return
		}
		t := time.Now().Add(duration)
		expiresAt = &t
	} else if req.ExpiresIn == "" {
		// Default: 24 hours
		t := time.Now().Add(24 * time.Hour)
		expiresAt = &t
	}

	res, err := a.db.Exec(
		"INSERT INTO shared_links (token, filename, expires_at) VALUES (?, ?, ?)",
		token, req.Filename, expiresAt,
	)

	if err != nil {
		log.Printf("HandleCreateShareLink: %v", err)
		http.Error(w, "Failed to create share link", http.StatusInternalServerError)
		return
	}

	id, _ := res.LastInsertId()
	link := models.SharedLink{
		ID:        int(id),
		Token:     token,
		Filename:  req.Filename,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
	}

	setJSON(w)
	json.NewEncoder(w).Encode(link)
}

func parseDuration(s string) (time.Duration, error) {
	// Support "1h", "24h", "7d", "30d"
	if strings.HasSuffix(s, "d") {
		numStr := strings.TrimSuffix(s, "d")
		var days int
		if _, err := json.Number(numStr).Int64(); err == nil {
			n, _ := json.Number(numStr).Int64()
			days = int(n)
		} else {
			return 0, err
		}
		return time.Duration(days) * 24 * time.Hour, nil
	}
	return time.ParseDuration(s)
}

func (a *API) HandleListShareLinks(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query("SELECT id, token, filename, expires_at, created_at FROM shared_links ORDER BY created_at DESC")
	if err != nil {
		log.Printf("HandleListShareLinks: %v", err)
		http.Error(w, "Failed to list share links", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var links []models.SharedLink
	for rows.Next() {
		var l models.SharedLink
		if err := rows.Scan(&l.ID, &l.Token, &l.Filename, &l.ExpiresAt, &l.CreatedAt); err != nil {
			continue
		}
		links = append(links, l)
	}

	if links == nil {
		links = []models.SharedLink{}
	}
	setJSON(w)
	json.NewEncoder(w).Encode(links)
}

func (a *API) HandleRevokeShareLink(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	_, err := a.db.Exec("DELETE FROM shared_links WHERE token = ?", token)
	if err != nil {
		log.Printf("HandleRevokeShareLink: %v", err)
		http.Error(w, "Failed to revoke link", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleUpdateShareLink(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	limitBody(r, maxJSONBodySize)
	var req struct {
		ExpiresIn string `json:"expires_in"` // "1h", "24h", "7d", "30d", "never"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.ExpiresIn == "never" {
		_, err := a.db.Exec("UPDATE shared_links SET expires_at = NULL WHERE token = ?", token)
		if err != nil {
			log.Printf("HandleUpdateShareLink: %v", err)
			http.Error(w, "Failed to update link", http.StatusInternalServerError)
			return
		}
	} else {
		duration, err := parseDuration(req.ExpiresIn)
		if err != nil {
			http.Error(w, "Invalid expires_in value", http.StatusBadRequest)
			return
		}
		newExpiry := time.Now().Add(duration)
		_, err = a.db.Exec("UPDATE shared_links SET expires_at = ? WHERE token = ?", newExpiry, token)
		if err != nil {
			log.Printf("HandleUpdateShareLink: %v", err)
			http.Error(w, "Failed to update link", http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleViewSharedNote(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	var link models.SharedLink
	err := a.db.QueryRow(
		"SELECT id, token, filename, expires_at, created_at FROM shared_links WHERE token = ?", token,
	).Scan(&link.ID, &link.Token, &link.Filename, &link.ExpiresAt, &link.CreatedAt)

	if err == sql.ErrNoRows {
		http.Error(w, "Link not found or expired", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("HandleViewSharedNote: %v", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	// Check expiration
	if link.ExpiresAt != nil && time.Now().After(*link.ExpiresAt) {
		http.Error(w, "This shared link has expired", http.StatusGone)
		return
	}

	// Fetch note content
	var n models.Note
	err = a.db.QueryRow("SELECT id, filename, title, COALESCE(frontmatter, '{}'), content, is_pinned, last_modified FROM notes WHERE filename = ?", link.Filename).
		Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.Content, &n.IsPinned, &n.LastModified)

	if err == sql.ErrNoRows {
		// Fallback to disk
		path, pathErr := safePath(a.dataDir, link.Filename)
		if pathErr != nil {
			http.Error(w, "Note not found", http.StatusNotFound)
			return
		}
		content, err := os.ReadFile(path)
		if err != nil {
			http.Error(w, "Note not found", http.StatusNotFound)
			return
		}
		n.Filename = link.Filename
		n.Content = string(content)
		n.Title = link.Filename
	} else if err != nil {
		log.Printf("HandleViewSharedNote fetch: %v", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	setJSON(w)
	json.NewEncoder(w).Encode(n)
}

var sharedWikiLinkRegex = regexp.MustCompile(`\[\[([^\]]+)\]\]`)

func (a *API) HandleViewSharedLinkedNote(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	requestedFile := chi.URLParam(r, "filename")
	// URL-decode in case chi doesn't fully decode %2F etc.
	requestedFile, _ = url.PathUnescape(requestedFile)

	// 1. Validate the share token
	var link models.SharedLink
	err := a.db.QueryRow(
		"SELECT id, token, filename, expires_at, created_at FROM shared_links WHERE token = ?", token,
	).Scan(&link.ID, &link.Token, &link.Filename, &link.ExpiresAt, &link.CreatedAt)

	if err == sql.ErrNoRows {
		http.Error(w, "Link not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("HandleViewSharedLinkedNote: %v", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	// 2. Check expiration
	if link.ExpiresAt != nil && time.Now().After(*link.ExpiresAt) {
		http.Error(w, "This shared link has expired", http.StatusGone)
		return
	}

	// 3. Fetch the PARENT shared note content to check for [[...]] reference
	var parentContent string
	err = a.db.QueryRow("SELECT content FROM notes WHERE filename = ?", link.Filename).Scan(&parentContent)
	if err != nil {
		// Fallback to disk
		parentPath, pathErr := safePath(a.dataDir, link.Filename)
		if pathErr != nil {
			http.Error(w, "Parent note not found", http.StatusNotFound)
			return
		}
		contentBytes, readErr := os.ReadFile(parentPath)
		if readErr != nil {
			http.Error(w, "Parent note not found", http.StatusNotFound)
			return
		}
		parentContent = string(contentBytes)
	}

	// 4. Check that the requested file is actually referenced via [[...]] in the parent
	// Normalize the requested file for matching
	reqWithoutMd := strings.TrimSuffix(requestedFile, ".md")
	reqBase := filepath.Base(reqWithoutMd)

	matches := sharedWikiLinkRegex.FindAllStringSubmatch(parentContent, -1)
	allowed := false
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		refName := match[1]
		// Handle pipe aliases like [[Note Name|Display Text]]
		if idx := strings.Index(refName, "|"); idx >= 0 {
			refName = strings.TrimSpace(refName[:idx])
		}
		refWithoutMd := strings.TrimSuffix(refName, ".md")
		refBase := filepath.Base(refWithoutMd)

		// Match: exact, with/without .md, or by base name (for subfolder references)
		if strings.EqualFold(refName, requestedFile) ||
			strings.EqualFold(refWithoutMd, reqWithoutMd) ||
			strings.EqualFold(refName, reqWithoutMd) ||
			strings.EqualFold(refWithoutMd, requestedFile) ||
			strings.EqualFold(refBase, reqBase) {
			allowed = true
			break
		}
	}

	if !allowed {
		http.Error(w, "This note is not linked from the shared note", http.StatusForbidden)
		return
	}

	// 5. Fetch the linked note
	targetFilename := requestedFile
	if !strings.HasSuffix(targetFilename, ".md") {
		targetFilename += ".md"
	}

	var n models.Note
	// Try exact match first, then base name match for notes in subdirectories
	err = a.db.QueryRow("SELECT id, filename, title, COALESCE(frontmatter, '{}'), content, is_pinned, last_modified FROM notes WHERE filename = ?", targetFilename).
		Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.Content, &n.IsPinned, &n.LastModified)

	if err == sql.ErrNoRows {
		// Try matching by base filename
		baseName := filepath.Base(targetFilename)
		err = a.db.QueryRow(`SELECT id, filename, title, COALESCE(frontmatter, '{}'), content, is_pinned, last_modified FROM notes WHERE filename = ? OR filename LIKE '%/' || ?`, baseName, baseName).
			Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.Content, &n.IsPinned, &n.LastModified)
	}

	if err == sql.ErrNoRows {
		path, pathErr := safePath(a.dataDir, targetFilename)
		if pathErr != nil {
			http.Error(w, "Linked note not found", http.StatusNotFound)
			return
		}
		content, readErr := os.ReadFile(path)
		if readErr != nil {
			http.Error(w, "Linked note not found", http.StatusNotFound)
			return
		}
		n.Filename = targetFilename
		n.Content = string(content)
		n.Title = strings.TrimSuffix(filepath.Base(targetFilename), ".md")
	} else if err != nil {
		log.Printf("HandleViewSharedLinkedNote fetch: %v", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	setJSON(w)
	json.NewEncoder(w).Encode(n)
}

func (a *API) HandleServeImage(w http.ResponseWriter, r *http.Request) {
	imagePath := chi.URLParam(r, "*")
	if imagePath == "" {
		http.Error(w, "Image path required", http.StatusBadRequest)
		return
	}

	fullPath := filepath.Join(a.dataDir, ".images", imagePath)

	// Security check: prevent path traversal
	cleanPath := filepath.Clean(fullPath)
	if !strings.HasPrefix(cleanPath, filepath.Join(a.dataDir, ".images")) {
		http.Error(w, "Invalid path", http.StatusForbidden)
		return
	}

	http.ServeFile(w, r, cleanPath)
}

// HandleServeSharedImage serves images referenced in a shared note, validated by token.
func (a *API) HandleServeSharedImage(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	imageName := chi.URLParam(r, "*")
	if imageName == "" {
		http.Error(w, "Image path required", http.StatusBadRequest)
		return
	}

	// 1. Validate the share token
	var link models.SharedLink
	err := a.db.QueryRow(
		"SELECT id, token, filename, expires_at, created_at FROM shared_links WHERE token = ?", token,
	).Scan(&link.ID, &link.Token, &link.Filename, &link.ExpiresAt, &link.CreatedAt)

	if err == sql.ErrNoRows {
		http.Error(w, "Link not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("HandleServeSharedImage: %v", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	// 2. Check expiration
	if link.ExpiresAt != nil && time.Now().After(*link.ExpiresAt) {
		http.Error(w, "This shared link has expired", http.StatusGone)
		return
	}

	// 3. Fetch the shared note content to verify the image is referenced
	var noteContent string
	err = a.db.QueryRow("SELECT content FROM notes WHERE filename = ?", link.Filename).Scan(&noteContent)
	if err != nil {
		// Fallback to disk
		notePath, pathErr := safePath(a.dataDir, link.Filename)
		if pathErr != nil {
			http.Error(w, "Note not found", http.StatusNotFound)
			return
		}
		contentBytes, readErr := os.ReadFile(notePath)
		if readErr != nil {
			http.Error(w, "Note not found", http.StatusNotFound)
			return
		}
		noteContent = string(contentBytes)
	}

	// 4. Verify this image is referenced in the note content
	safeImage := sanitizeFilename(imageName)
	if safeImage == "" {
		http.Error(w, "Invalid image name", http.StatusBadRequest)
		return
	}

	// Check for /images/NAME in the note content
	if !strings.Contains(noteContent, "/images/"+safeImage) {
		http.Error(w, "Image not found in shared note", http.StatusForbidden)
		return
	}

	// 5. Serve the image
	fullPath := filepath.Join(a.dataDir, ".images", safeImage)
	cleanPath := filepath.Clean(fullPath)
	if !strings.HasPrefix(cleanPath, filepath.Join(a.dataDir, ".images")) {
		http.Error(w, "Invalid path", http.StatusForbidden)
		return
	}

	http.ServeFile(w, r, cleanPath)
}

func (a *API) HandleGetBacklinks(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Query().Get("file")
	if filename == "" {
		http.Error(w, "file parameter is required", http.StatusBadRequest)
		return
	}

	title := strings.TrimSuffix(filepath.Base(filename), ".md")

	// Query using both: links table (indexed) and content LIKE (fallback)
	rows, err := a.db.Query(`
		SELECT DISTINCT n.id, n.filename, n.title, COALESCE(n.frontmatter, '{}'), n.content, n.is_pinned, n.last_modified
		FROM notes n
		WHERE n.filename != ? AND (
			n.id IN (
				SELECT l.source_id FROM links l
				JOIN notes target ON l.target_id = target.id
				WHERE target.filename = ?
			)
			OR n.content LIKE ?
		)
	`, filename, filename, "%[["+title+"]]%")
	if err != nil {
		log.Printf("HandleGetBacklinks: %v", err)
		http.Error(w, "Failed to get backlinks", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var notes []models.Note
	for rows.Next() {
		var n models.Note
		if err := rows.Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.Content, &n.IsPinned, &n.LastModified); err == nil {
			notes = append(notes, n)
		}
	}

	if notes == nil {
		notes = []models.Note{}
	}
	setJSON(w)
	json.NewEncoder(w).Encode(notes)
}

func (a *API) HandleGetGitStatus(w http.ResponseWriter, r *http.Request) {
	repo := os.Getenv("GITHUB_REPO")
	token := os.Getenv("GITHUB_TOKEN")
	hasToken := token != ""

	// Read local config file if exists
	disabled := false
	configPath := filepath.Join(a.dataDir, ".git_config.json")
	if data, err := os.ReadFile(configPath); err == nil {
		var cfg struct {
			Disabled bool `json:"disabled"`
		}
		if err := json.Unmarshal(data, &cfg); err == nil {
			disabled = cfg.Disabled
		}
	}

	userName := os.Getenv("GIT_AUTHOR_NAME")
	if userName == "" {
		userName = "App User"
	}
	userEmail := os.Getenv("GIT_AUTHOR_EMAIL")
	if userEmail == "" {
		userEmail = "app@local"
	}

	gitMgr := gitops.NewGitManager(a.dataDir)
	logs := gitMgr.GetSyncLogs()

	status := map[string]interface{}{
		"enabled":       repo != "",
		"sync_disabled": disabled,
		"repo":          repo,
		"has_token":     hasToken,
		"author_name":   userName,
		"author_email":  userEmail,
		"sync_logs":     logs,
	}

	setJSON(w)
	json.NewEncoder(w).Encode(status)
}

func (a *API) HandleToggleGitSync(w http.ResponseWriter, r *http.Request) {
	limitBody(r, maxJSONBodySize)
	var req struct {
		Disabled bool `json:"disabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	configPath := filepath.Join(a.dataDir, ".git_config.json")
	configData, err := json.MarshalIndent(req, "", "  ")
	if err != nil {
		http.Error(w, "Failed to serialize config", http.StatusInternalServerError)
		return
	}

	if err := os.WriteFile(configPath, configData, 0644); err != nil {
		http.Error(w, "Failed to write config file", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleCheckGitConnection(w http.ResponseWriter, r *http.Request) {
	repoURL := os.Getenv("GITHUB_REPO")
	token := os.Getenv("GITHUB_TOKEN")

	if repoURL == "" {
		setJSON(w)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "GITHUB_REPO environment variable is not configured. Add GITHUB_REPO=https://github.com/username/your-notes.git in your compose.yml.",
		})
		return
	}

	if token == "" {
		setJSON(w)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "GITHUB_TOKEN environment variable is missing. Create a Personal Access Token on GitHub with 'Contents: Read and Write' permissions and set GITHUB_TOKEN in your compose.yml.",
		})
		return
	}

	gitMgr := gitops.NewGitManager(a.dataDir)
	repo := gitMgr.InitRepo()
	if repo == nil {
		setJSON(w)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Failed to initialize local git repository.",
		})
		return
	}

	remoteName := "origin"
	remotes, err := repo.Remotes()
	if err != nil {
		setJSON(w)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Failed to list remotes: %v", err),
		})
		return
	}

	var originRemote *git.Remote
	for _, r := range remotes {
		if r.Config().Name == remoteName {
			originRemote = r
			break
		}
	}

	if originRemote == nil {
		originRemote, err = repo.CreateRemote(&config.RemoteConfig{
			Name: remoteName,
			URLs: []string{repoURL},
		})
		if err != nil {
			setJSON(w)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"message": fmt.Sprintf("Failed to create remote: %v", err),
			})
			return
		}
	}

	auth := &gitHttp.BasicAuth{
		Username: "git",
		Password: token,
	}

	// Try listing remote references to test connection and auth
	_, err = originRemote.List(&git.ListOptions{
		Auth: auth,
	})
	if err != nil {
		setJSON(w)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Authentication/Connection failed: %v", err),
		})
		return
	}

	watcher.SyncDatabaseWithDisk(a.db, a.dataDir)

	setJSON(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Successfully authenticated and connected to GitHub repository!",
	})
}

func (a *API) HandleGitPushAll(w http.ResponseWriter, r *http.Request) {
	gitMgr := gitops.NewGitManager(a.dataDir)
	repo := gitMgr.InitRepo()
	if repo == nil {
		setJSON(w)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Failed to initialize local git repository.",
		})
		return
	}

	log.Println("GitHub Sync: manual push-all triggered from settings")
	// CommitAll commits untracked and modified changes, pulling and pushing remote under the hood
	gitMgr.CommitAll("Sync all notes to GitHub")
	watcher.SyncDatabaseWithDisk(a.db, a.dataDir)

	// Get latest logs to check for success/errors
	logs := gitMgr.GetSyncLogs()
	var lastErr string
	if len(logs) > 0 && !logs[0].Success {
		lastErr = logs[0].Error
	}

	setJSON(w)
	if lastErr != "" {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Push completed with warnings: " + lastErr,
		})
	} else {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Successfully committed and pushed all notes to GitHub!",
		})
	}
}

func getVersion() string {
	paths := []string{"VERSION", "../VERSION", "backend/VERSION"}
	for _, p := range paths {
		if data, err := os.ReadFile(p); err == nil {
			return strings.TrimSpace(string(data))
		}
	}
	return "unknown"
}

func (a *API) HandleGetVersion(w http.ResponseWriter, r *http.Request) {
	setJSON(w)
	json.NewEncoder(w).Encode(map[string]string{
		"version": getVersion(),
	})
}

func (a *API) HandleListImages(w http.ResponseWriter, r *http.Request) {
	imagesDir := filepath.Join(a.dataDir, ".images")
	var images []string
	entries, err := os.ReadDir(imagesDir)
	if err != nil {
		if os.IsNotExist(err) {
			setJSON(w)
			json.NewEncoder(w).Encode([]string{})
			return
		}
		log.Printf("HandleListImages: %v", err)
		http.Error(w, "Failed to read images directory", http.StatusInternalServerError)
		return
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			images = append(images, entry.Name())
		}
	}

	if images == nil {
		images = []string{}
	}

	setJSON(w)
	json.NewEncoder(w).Encode(images)
}

func (a *API) HandleDeleteImage(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	name, _ = url.PathUnescape(name)
	safe := sanitizeFilename(name)
	if safe == "" {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	fullPath := filepath.Join(a.dataDir, ".images", safe)
	if err := os.Remove(fullPath); err != nil {
		log.Printf("HandleDeleteImage: %v", err)
		http.Error(w, "Failed to delete image", http.StatusInternalServerError)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	git.CommitAll("Delete image " + safe)

	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleSyncDatabase(w http.ResponseWriter, r *http.Request) {
	watcher.SyncDatabaseWithDisk(a.db, a.dataDir)
	setJSON(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Database successfully synchronized with disk.",
	})
}

func (a *API) HandleServeRawFile(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "*")
	filename, _ = url.PathUnescape(filename)

	path, err := safePath(a.dataDir, filename)
	if err != nil {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".pdf":
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", "inline; filename=\""+filepath.Base(path)+"\"")
	case ".html", ".htm":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	case ".txt":
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	case ".md", ".markdown":
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	default:
		w.Header().Set("Content-Type", "application/octet-stream")
	}

	http.ServeFile(w, r, path)
}

func (a *API) HandleUploadFile(w http.ResponseWriter, r *http.Request) {
	// 50MB max upload size
	r.Body = http.MaxBytesReader(w, r.Body, 50*1024*1024)
	if err := r.ParseMultipartForm(50 * 1024 * 1024); err != nil {
		http.Error(w, "File too large or invalid multipart form", http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Error retrieving file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	folder := strings.TrimSpace(r.FormValue("folder"))
	folder = strings.TrimPrefix(folder, "/")
	folder = strings.TrimSuffix(folder, "/")

	cleanFilename := sanitizeFilename(handler.Filename)
	if cleanFilename == "" || !watcher.IsSupportedNoteFile(cleanFilename) {
		http.Error(w, "File type not supported. Allowed: .md, .txt, .html, .pdf", http.StatusBadRequest)
		return
	}

	targetRelPath := cleanFilename
	if folder != "" {
		targetRelPath = filepath.Join(folder, cleanFilename)
	}

	fullPath, err := safePath(a.dataDir, targetRelPath)
	if err != nil {
		http.Error(w, "Invalid target path", http.StatusBadRequest)
		return
	}

	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("HandleUploadFile mkdir: %v", err)
		http.Error(w, "Failed to create directory", http.StatusInternalServerError)
		return
	}

	dst, err := os.Create(fullPath)
	if err != nil {
		log.Printf("HandleUploadFile create: %v", err)
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		log.Printf("HandleUploadFile write: %v", err)
		http.Error(w, "Failed to write file contents", http.StatusInternalServerError)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	git.CommitFile(targetRelPath, "Upload "+targetRelPath)
	watcher.SyncDatabaseWithDisk(a.db, a.dataDir)

	setJSON(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"filename":  targetRelPath,
		"file_type": detectFileType(targetRelPath),
		"raw_url":   "/api/raw/" + targetRelPath,
	})
}



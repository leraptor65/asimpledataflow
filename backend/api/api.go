package api

import (
	"archive/zip"
	"bytes"
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
	"os/exec"
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
	r.Post("/api/upload", a.HandleUploadImage)
	r.Post("/api/folders", a.HandleCreateFolder)
	r.Put("/api/move", a.HandleMoveItem)
	r.Delete("/api/delete", a.HandleDeleteItem)
	r.Get("/api/tree", a.HandleGetTree)
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

	// Orphan image cleanup
	r.Get("/api/orphan-images", a.HandleGetOrphanImages)
	r.Delete("/api/orphan-images", a.HandleDeleteOrphanImages)

	// Backlinks
	r.Get("/api/backlinks", a.HandleGetBacklinks)

	// Git status info for Settings
	r.Get("/api/git/status", a.HandleGetGitStatus)
	r.Post("/api/git/toggle", a.HandleToggleGitSync)
	r.Post("/api/git/check", a.HandleCheckGitConnection)
}

func (a *API) HandleListNotes(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query("SELECT DISTINCT ON (filename) id, filename, title, COALESCE(frontmatter, '{}'), content, last_modified FROM notes ORDER BY filename, last_modified DESC")
	if err != nil {
		log.Printf("HandleListNotes: %v", err)
		http.Error(w, "Failed to list notes", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var notes []models.Note
	for rows.Next() {
		var n models.Note
		if err := rows.Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.Content, &n.LastModified); err != nil {
			continue
		}
		notes = append(notes, n)
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
	err := a.db.QueryRow("SELECT id, filename, title, COALESCE(frontmatter, '{}'), content, last_modified FROM notes WHERE filename = $1", filename).
		Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.Content, &n.LastModified)

	if err == sql.ErrNoRows {
		// Try falling back to disk if watcher hasn't caught it yet
		path, pathErr := safePath(a.dataDir, filename)
		if pathErr != nil {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}
		content, err := os.ReadFile(path)
		if err != nil {
			http.Error(w, "Note not found", http.StatusNotFound)
			return
		}
		n.Filename = filename
		n.Content = string(content)
		n.Title = filename
	} else if err != nil {
		log.Printf("HandleGetNote: %v", err)
		http.Error(w, "Failed to get note", http.StatusInternalServerError)
		return
	}

	setJSON(w)
	json.NewEncoder(w).Encode(n)
}

func (a *API) HandleSaveNote(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "*")
	if filename == "" {
		filename = chi.URLParam(r, "filename")
	}
	filename, _ = url.PathUnescape(filename)

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
	git.CommitFile(filename, "Update "+filename)

	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleSearchNotes(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "Query parameter 'q' is required", http.StatusBadRequest)
		return
	}

	// Postgres Full Text Search
	rows, err := a.db.Query(`
		SELECT DISTINCT ON (filename) id, filename, title, COALESCE(frontmatter, '{}'), last_modified 
		FROM notes 
		WHERE content_vector @@ plainto_tsquery('english', $1)
		ORDER BY filename, ts_rank(content_vector, plainto_tsquery('english', $1)) DESC
	`, query)

	if err != nil {
		log.Printf("HandleSearchNotes: %v", err)
		http.Error(w, "Search failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var notes []models.Note
	for rows.Next() {
		var n models.Note
		err := rows.Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.LastModified)
		if err == nil {
			notes = append(notes, n)
		}
	}

	setJSON(w)
	json.NewEncoder(w).Encode(notes)
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
		// Also skip files that aren't markdown
		if !info.IsDir() && !strings.HasSuffix(info.Name(), ".md") {
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

	var link models.SharedLink
	err := a.db.QueryRow(
		"INSERT INTO shared_links (token, filename, expires_at) VALUES ($1, $2, $3) RETURNING id, token, filename, expires_at, created_at",
		token, req.Filename, expiresAt,
	).Scan(&link.ID, &link.Token, &link.Filename, &link.ExpiresAt, &link.CreatedAt)

	if err != nil {
		log.Printf("HandleCreateShareLink: %v", err)
		http.Error(w, "Failed to create share link", http.StatusInternalServerError)
		return
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
	_, err := a.db.Exec("DELETE FROM shared_links WHERE token = $1", token)
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
		_, err := a.db.Exec("UPDATE shared_links SET expires_at = NULL WHERE token = $1", token)
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
		_, err = a.db.Exec("UPDATE shared_links SET expires_at = $1 WHERE token = $2", newExpiry, token)
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
		"SELECT id, token, filename, expires_at, created_at FROM shared_links WHERE token = $1", token,
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
	err = a.db.QueryRow("SELECT id, filename, title, COALESCE(frontmatter, '{}'), content, last_modified FROM notes WHERE filename = $1", link.Filename).
		Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.Content, &n.LastModified)

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
		"SELECT id, token, filename, expires_at, created_at FROM shared_links WHERE token = $1", token,
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
	err = a.db.QueryRow("SELECT content FROM notes WHERE filename = $1", link.Filename).Scan(&parentContent)
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
	err = a.db.QueryRow("SELECT id, filename, title, COALESCE(frontmatter, '{}'), content, last_modified FROM notes WHERE filename = $1", targetFilename).
		Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.Content, &n.LastModified)

	if err == sql.ErrNoRows {
		// Try matching by base filename
		baseName := filepath.Base(targetFilename)
		err = a.db.QueryRow(`SELECT id, filename, title, COALESCE(frontmatter, '{}'), content, last_modified FROM notes WHERE filename = $1 OR filename LIKE '%/' || $1`, baseName).
			Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.Content, &n.LastModified)
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
		"SELECT id, token, filename, expires_at, created_at FROM shared_links WHERE token = $1", token,
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
	err = a.db.QueryRow("SELECT content FROM notes WHERE filename = $1", link.Filename).Scan(&noteContent)
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

var imageRefRegex = regexp.MustCompile(`!\[.*?\]\(/images/([^)]+)\)`)

func (a *API) HandleGetOrphanImages(w http.ResponseWriter, r *http.Request) {
	// 1. Get all images on disk
	imagesDir := filepath.Join(a.dataDir, ".images")
	diskImages := map[string]bool{}

	entries, err := os.ReadDir(imagesDir)
	if err != nil {
		if os.IsNotExist(err) {
			setJSON(w)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"orphaned": []string{},
				"total":    0,
			})
			return
		}
		log.Printf("HandleGetOrphanImages: %v", err)
		http.Error(w, "Failed to get orphan images", http.StatusInternalServerError)
		return
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			diskImages[entry.Name()] = true
		}
	}

	// 2. Scan all note content for image references
	rows, err := a.db.Query("SELECT content FROM notes")
	if err != nil {
		log.Printf("HandleGetOrphanImages query: %v", err)
		http.Error(w, "Failed to scan notes", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	referencedImages := map[string]bool{}
	for rows.Next() {
		var content string
		if err := rows.Scan(&content); err != nil {
			continue
		}
		matches := imageRefRegex.FindAllStringSubmatch(content, -1)
		for _, match := range matches {
			if len(match) > 1 {
				referencedImages[match[1]] = true
			}
		}
	}

	// 3. Find orphaned images (on disk but not referenced)
	var orphaned []string
	for img := range diskImages {
		if !referencedImages[img] {
			orphaned = append(orphaned, img)
		}
	}

	if orphaned == nil {
		orphaned = []string{}
	}

	setJSON(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"orphaned": orphaned,
		"total":    len(diskImages),
	})
}

func (a *API) HandleDeleteOrphanImages(w http.ResponseWriter, r *http.Request) {
	limitBody(r, maxJSONBodySize)
	var req struct {
		Images []string `json:"images"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	imagesDir := filepath.Join(a.dataDir, ".images")
	var deleted []string
	for _, img := range req.Images {
		// Security: only allow filenames, no path traversal
		safe := sanitizeFilename(img)
		if safe == "" || safe != img {
			continue
		}
		fullPath := filepath.Join(imagesDir, safe)
		if err := os.Remove(fullPath); err == nil {
			deleted = append(deleted, safe)
		}
	}

	if len(deleted) > 0 {
		git := gitops.NewGitManager(a.dataDir)
		git.CommitAll("Cleanup orphan images")
	}

	setJSON(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"deleted": deleted,
	})
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
		SELECT DISTINCT n.id, n.filename, n.title, COALESCE(n.frontmatter, '{}'), n.last_modified
		FROM notes n
		WHERE n.filename != $1 AND (
			n.id IN (
				SELECT l.source_id FROM links l
				JOIN notes target ON l.target_id = target.id
				WHERE target.filename = $1
			)
			OR n.content LIKE '%[[' || $2 || ']]%'
		)
	`, filename, title)
	if err != nil {
		log.Printf("HandleGetBacklinks: %v", err)
		http.Error(w, "Failed to get backlinks", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var notes []models.Note
	for rows.Next() {
		var n models.Note
		if err := rows.Scan(&n.ID, &n.Filename, &n.Title, &n.Frontmatter, &n.LastModified); err == nil {
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

	// Get gh auth status
	ghStatus, ghErr := gitops.GetGHAuthStatus()
	ghLoggedIn := ghErr == nil

	// Check if gh CLI is installed
	ghInstalled := true
	if _, err := exec.LookPath("gh"); err != nil {
		ghInstalled = false
	}

	// Get token availability
	hasToken := false
	if ghLoggedIn {
		cmd := exec.Command("gh", "auth", "token")
		var out bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = nil
		if err := cmd.Run(); err == nil && strings.TrimSpace(out.String()) != "" {
			hasToken = true
		}
	}

	// Get git config values
	userName := ""
	userEmail := ""
	if gitNameCmd := exec.Command("git", "config", "--get", "user.name"); gitNameCmd != nil {
		var out bytes.Buffer
		gitNameCmd.Stdout = &out
		gitNameCmd.Stderr = nil
		if err := gitNameCmd.Run(); err == nil {
			userName = strings.TrimSpace(out.String())
		}
	}
	if gitEmailCmd := exec.Command("git", "config", "--get", "user.email"); gitEmailCmd != nil {
		var out bytes.Buffer
		gitEmailCmd.Stdout = &out
		gitEmailCmd.Stderr = nil
		if err := gitEmailCmd.Run(); err == nil {
			userEmail = strings.TrimSpace(out.String())
		}
	}

	status := map[string]interface{}{
		"enabled":       repo != "",
		"sync_disabled": disabled,
		"repo":          repo,
		"gh_installed":  ghInstalled,
		"gh_logged_in":  ghLoggedIn,
		"gh_status":     ghStatus,
		"has_token":     hasToken,
		"author_name":   userName,
		"author_email":  userEmail,
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
	if repoURL == "" {
		setJSON(w)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "GITHUB_REPO environment variable is not configured.",
		})
		return
	}

	// Get token from gh auth
	var token string
	cmd := exec.Command("gh", "auth", "token")
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = nil
	if err := cmd.Run(); err == nil {
		token = strings.TrimSpace(out.String())
	}

	if token == "" {
		// Also try to get gh auth status for diagnostics
		ghStatus, _ := gitops.GetGHAuthStatus()
		msg := "No GitHub token available. Run 'gh auth login' on the host machine."
		if ghStatus != "" {
			msg += "\n\ngh auth status output:\n" + ghStatus
		}
		setJSON(w)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": msg,
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

	setJSON(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Successfully authenticated and connected to GitHub repository!",
	})
}

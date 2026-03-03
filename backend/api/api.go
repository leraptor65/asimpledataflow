package api

import (
	"archive/zip"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/leraptor65/simple-data-flow/gitops"
	"github.com/leraptor65/simple-data-flow/models"
)

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

	// Image serving
	r.Get("/images/*", a.HandleServeImage)

	// Orphan image cleanup
	r.Get("/api/orphan-images", a.HandleGetOrphanImages)
	r.Delete("/api/orphan-images", a.HandleDeleteOrphanImages)

	// Backlinks
	r.Get("/api/backlinks", a.HandleGetBacklinks)
}

func (a *API) HandleListNotes(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query("SELECT id, filename, title, COALESCE(frontmatter, '{}'), content, last_modified FROM notes ORDER BY last_modified DESC")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
		path := filepath.Join(a.dataDir, filename)
		content, err := os.ReadFile(path)
		if err != nil {
			http.Error(w, "Note not found", http.StatusNotFound)
			return
		}
		n.Filename = filename
		n.Content = string(content)
		n.Title = filename
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(n)
}

func (a *API) HandleSaveNote(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "*")
	if filename == "" {
		filename = chi.URLParam(r, "filename")
	}
	filename, _ = url.PathUnescape(filename)

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	path := filepath.Join(a.dataDir, filename)

	err := os.WriteFile(path, []byte(req.Content), 0644)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
		SELECT id, filename, title, COALESCE(frontmatter, '{}'), last_modified 
		FROM notes 
		WHERE content_vector @@ plainto_tsquery('english', $1)
		ORDER BY ts_rank(content_vector, plainto_tsquery('english', $1)) DESC
	`, query)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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

	json.NewEncoder(w).Encode(notes)
}

func (a *API) HandleUploadImage(w http.ResponseWriter, r *http.Request) {
	file, handler, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "Error retrieving image", http.StatusBadRequest)
		return
	}
	defer file.Close()

	imagesDir := filepath.Join(a.dataDir, ".images")
	os.MkdirAll(imagesDir, 0755)

	dstPath := filepath.Join(imagesDir, handler.Filename)
	dst, err := os.Create(dstPath)
	if err != nil {
		http.Error(w, "Error saving file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "Error writing file", http.StatusInternalServerError)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	git.CommitFile(filepath.Join(".images", handler.Filename), "Upload image "+handler.Filename)

	json.NewEncoder(w).Encode(map[string]string{
		"url": "/images/" + handler.Filename,
	})
}

func (a *API) HandleCreateFolder(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	fullPath := filepath.Join(a.dataDir, req.Path)

	err := os.MkdirAll(fullPath, 0755)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
	var req struct {
		Source      string `json:"source"`
		Destination string `json:"destination"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	srcPath := filepath.Join(a.dataDir, req.Source)
	destPath := filepath.Join(a.dataDir, req.Destination)

	err := os.Rename(srcPath, destPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	git.CommitAll("Move " + req.Source + " to " + req.Destination)

	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleDeleteItem(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	sourcePath := filepath.Join(a.dataDir, req.Path)
	recyclePath := filepath.Join(a.dataDir, ".recycle_bin")

	if err := os.MkdirAll(recyclePath, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	destPath := filepath.Join(recyclePath, filepath.Base(req.Path))

	// Move file/folder to recycle bin
	if err := os.Rename(sourcePath, destPath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(commits)
}

func (a *API) HandleRevertFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Hash     string `json:"hash"`
		Filename string `json:"filename"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	err := git.CheckoutFile(req.Hash, req.Filename)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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

	git := gitops.NewGitManager(a.dataDir)
	content, err := git.GetFileContentAtHash(hash, filename)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(content))
}

func (a *API) HandleGetRecycleBin(w http.ResponseWriter, r *http.Request) {
	recyclePath := filepath.Join(a.dataDir, ".recycle_bin")
	if _, err := os.Stat(recyclePath); os.IsNotExist(err) {
		json.NewEncoder(w).Encode([]TreeItem{})
		return
	}

	var items []TreeItem
	entries, err := os.ReadDir(recyclePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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

	json.NewEncoder(w).Encode(items)
}

func (a *API) HandleRestoreRecycledItem(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	sourcePath := filepath.Join(a.dataDir, ".recycle_bin", req.Name)
	destPath := filepath.Join(a.dataDir, req.Name)

	if err := os.Rename(sourcePath, destPath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	git := gitops.NewGitManager(a.dataDir)
	git.CommitAll("Restored " + req.Name + " from .recycle_bin")

	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleDeleteRecycledItemPermanent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	targetPath := filepath.Join(a.dataDir, ".recycle_bin", req.Name)
	if err := os.RemoveAll(targetPath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
		if strings.HasPrefix(relPath, "..") || strings.HasPrefix(relPath, ".git") || strings.HasPrefix(relPath, ".recycle_bin") {
			continue
		}

		targetPath := filepath.Join(a.dataDir, relPath)

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
	var req struct {
		Filename  string `json:"filename"`
		ExpiresIn string `json:"expires_in"` // e.g. "24h", "7d", "never"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

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
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
	json.NewEncoder(w).Encode(links)
}

func (a *API) HandleRevokeShareLink(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	_, err := a.db.Exec("DELETE FROM shared_links WHERE token = $1", token)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (a *API) HandleUpdateShareLink(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	var req struct {
		ExpiresIn string `json:"expires_in"` // "1h", "24h", "7d", "30d", "never"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.ExpiresIn == "never" {
		_, err := a.db.Exec("UPDATE shared_links SET expires_at = NULL WHERE token = $1", token)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
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
			http.Error(w, err.Error(), http.StatusInternalServerError)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
		path := filepath.Join(a.dataDir, link.Filename)
		content, err := os.ReadFile(path)
		if err != nil {
			http.Error(w, "Note not found", http.StatusNotFound)
			return
		}
		n.Filename = link.Filename
		n.Content = string(content)
		n.Title = link.Filename
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

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

var imageRefRegex = regexp.MustCompile(`!\[.*?\]\(/images/([^)]+)\)`)

func (a *API) HandleGetOrphanImages(w http.ResponseWriter, r *http.Request) {
	// 1. Get all images on disk
	imagesDir := filepath.Join(a.dataDir, ".images")
	diskImages := map[string]bool{}

	entries, err := os.ReadDir(imagesDir)
	if err != nil {
		if os.IsNotExist(err) {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"orphaned": []string{},
				"total":    0,
			})
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
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

	json.NewEncoder(w).Encode(map[string]interface{}{
		"orphaned": orphaned,
		"total":    len(diskImages),
	})
}

func (a *API) HandleDeleteOrphanImages(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Images []string `json:"images"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	imagesDir := filepath.Join(a.dataDir, ".images")
	var deleted []string
	for _, img := range req.Images {
		// Security: only allow filenames, no path traversal
		if strings.Contains(img, "/") || strings.Contains(img, "..") {
			continue
		}
		fullPath := filepath.Join(imagesDir, img)
		if err := os.Remove(fullPath); err == nil {
			deleted = append(deleted, img)
		}
	}

	if len(deleted) > 0 {
		git := gitops.NewGitManager(a.dataDir)
		git.CommitAll("Cleanup orphan images")
	}

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

	// Find notes whose content contains [[title]] where title matches this note
	title := strings.TrimSuffix(filepath.Base(filename), ".md")

	rows, err := a.db.Query(`
		SELECT id, filename, title, COALESCE(frontmatter, '{}'), last_modified
		FROM notes 
		WHERE content LIKE '%[[' || $1 || ']]%' 
		AND filename != $2
	`, title, filename)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
	json.NewEncoder(w).Encode(notes)
}

package main

import (
	"archive/zip"
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// The path to the directory where markdown files are stored.
var dataDir = "/app/data"
var trashDir = "/app/data/.trash"
var imagesDir = "/app/data/.images"
var logsDir = "/app/data/.logs"
var logFile = filepath.Join(logsDir, "activity.log")
var referencesFile = filepath.Join(dataDir, ".references.json")
var shareLinksFile = filepath.Join(dataDir, ".share_links.json")
var referenceRegex = regexp.MustCompile(`@\(([^)]+)\)`)

// FileSystemItem represents a file or folder in the directory tree.
type FileSystemItem struct {
	Name     string           `json:"name"`
	Path     string           `json:"path"`
	Type     string           `json:"type"`
	Children []FileSystemItem `json:"children,omitempty"`
}

// RenameOperation records a single rename action.
type RenameOperation struct {
	OldPath string `json:"oldPath"`
	NewPath string `json:"newPath"`
}

// ImageFile represents an image file in the images directory.
type ImageFile struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type ShareLink struct {
	ID           string     `json:"id"`
	DocumentPath string     `json:"documentPath"`
	ExpiresAt    *time.Time `json:"expiresAt"`
}

type UpdateShareLinkRequest struct {
	Duration string `json:"duration"` // e.g., "1h", "24h", "168h", "never"
}

// References maps a document path to a list of paths that reference it.
type References map[string][]string

// --- Share Link Management ---

func loadShareLinks() ([]ShareLink, error) {
	var links []ShareLink
	if _, err := os.Stat(shareLinksFile); os.IsNotExist(err) {
		return links, nil
	}
	data, err := os.ReadFile(shareLinksFile)
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return links, nil
	}
	err = json.Unmarshal(data, &links)
	return links, err
}

func saveShareLinks(links []ShareLink) error {
	data, err := json.MarshalIndent(links, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(shareLinksFile, data, 0644)
}

func generateRandomID(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func cleanupExpiredLinks() {
	for {
		time.Sleep(1 * time.Hour)
		links, err := loadShareLinks()
		if err != nil {
			log.Printf("Error loading share links for cleanup: %v", err)
			continue
		}

		var activeLinks []ShareLink
		now := time.Now()
		for _, link := range links {
			if link.ExpiresAt == nil || now.Before(*link.ExpiresAt) {
				activeLinks = append(activeLinks, link)
			}
		}

		if len(activeLinks) < len(links) {
			if err := saveShareLinks(activeLinks); err != nil {
				log.Printf("Error saving cleaned share links: %v", err)
			}
		}
	}
}

// --- Reference Management ---

func loadReferences() (References, error) {
	refs := make(References)
	if _, err := os.Stat(referencesFile); os.IsNotExist(err) {
		return refs, nil
	}
	data, err := os.ReadFile(referencesFile)
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return refs, nil
	}
	err = json.Unmarshal(data, &refs)
	return refs, err
}

func saveReferences(refs References) error {
	data, err := json.MarshalIndent(refs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(referencesFile, data, 0644)
}

func extractReferences(content []byte) []string {
	re := referenceRegex
	matches := re.FindAllSubmatch(content, -1)
	var refs []string
	seen := make(map[string]bool)
	for _, match := range matches {
		if len(match) > 1 {
			refName := string(match[1])
			if !seen[refName] {
				refs = append(refs, refName)
				seen[refName] = true
			}
		}
	}
	return refs
}

// remove all references that point FROM path
func cleanReferencesFrom(refs References, path string) {
	for target, sources := range refs {
		newSources := []string{}
		for _, source := range sources {
			if source != path {
				newSources = append(newSources, source)
			}
		}
		refs[target] = newSources
	}
}

func updateReferencesForFile(path string, content []byte) error {
	refs, err := loadReferences()
	if err != nil {
		return err
	}

	cleanReferencesFrom(refs, path)

	newRefs := extractReferences(content)
	for _, target := range newRefs {
		found := false
		for _, source := range refs[target] {
			if source == path {
				found = true
				break
			}
		}
		if !found {
			refs[target] = append(refs[target], path)
		}
	}

	return saveReferences(refs)
}

func removeReferencesForFile(path string) error {
	refs, err := loadReferences()
	if err != nil {
		return err
	}

	cleanReferencesFrom(refs, path)
	delete(refs, path) // Also remove if this file itself was a target

	return saveReferences(refs)
}

func updateReferencesForRename(oldPath, newPath string, isDir bool) error {
	refs, err := loadReferences()
	if err != nil {
		return err
	}
	newRefs := make(References)

	if isDir {
		// Folder rename: update all paths with the old prefix
		oldPrefix := oldPath + "/"
		newPrefix := newPath + "/"

		for target, sources := range refs {
			newTarget := target
			if strings.HasPrefix(target, oldPrefix) {
				newTarget = newPrefix + strings.TrimPrefix(target, oldPrefix)
			} else if target == oldPath {
				newTarget = newPath // in case it's a reference to the folder itself
			}

			newSources := []string{}
			for _, source := range sources {
				if strings.HasPrefix(source, oldPrefix) {
					newSources = append(newSources, newPrefix+strings.TrimPrefix(source, oldPrefix))
				} else if source == oldPath {
					newSources = append(newSources, newPath)
				} else {
					newSources = append(newSources, source)
				}
			}
			newRefs[newTarget] = newSources
		}

	} else {
		// File rename: more targeted update
		for target, sources := range refs {
			newTarget := target
			if target == oldPath {
				newTarget = newPath
			}

			newSources := []string{}
			for _, source := range sources {
				if source == oldPath {
					newSources = append(newSources, newPath)
				} else {
					newSources = append(newSources, source)
				}
			}
			newRefs[newTarget] = newSources
		}
	}

	return saveReferences(refs)
}

// Helper function to decode URL path segments (replace underscores with spaces).
func decodePath(path string) string {
	return strings.ReplaceAll(path, "_", " ")
}

func logActivity(message string) {
	f, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("Error opening log file: %v", err)
		return
	}
	defer f.Close()

	timestamp := time.Now().Format("2006-01-02 15:04:05")
	logEntry := fmt.Sprintf("[%s] %s\n", timestamp, message)

	if _, err := f.WriteString(logEntry); err != nil {
		log.Printf("Error writing to log file: %v", err)
	}
}

// existsCaseInsensitive checks if an item with the given name (case-insensitive) already exists in a directory.
// The `exclude` parameter is a full path to an item to ignore, useful for rename/move operations.
func existsCaseInsensitive(dirPath, name, exclude string) (bool, error) {
	items, err := os.ReadDir(dirPath)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}

	for _, item := range items {
		existingFullPath := filepath.Join(dirPath, item.Name())
		if strings.EqualFold(existingFullPath, exclude) {
			continue
		}

		existingName := item.Name()
		// For files, compare without the extension
		if !item.IsDir() {
			existingName = strings.TrimSuffix(existingName, filepath.Ext(existingName))
		}

		if strings.EqualFold(existingName, name) {
			return true, nil
		}
	}
	return false, nil
}

// resolveNameConflicts walks through the data directory and renames files/folders
// that have case-insensitive name collisions.
func resolveNameConflicts() ([]RenameOperation, error) {
	var operations []RenameOperation
	// A map to hold directories and the items within them, to check for conflicts.
	// Key: directory path, Value: map of lower-case base names to full paths.
	dirContents := make(map[string]map[string]string)

	err := filepath.Walk(dataDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip special directories
		if info.IsDir() {
			if path == trashDir || path == imagesDir || path == logsDir {
				return filepath.SkipDir
			}
		}

		// Ignore root and special directories content
		parentDir := filepath.Dir(path)
		if parentDir == dataDir && strings.HasPrefix(info.Name(), ".") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		if path == dataDir {
			return nil
		}

		dir := filepath.Dir(path)
		name := info.Name()
		lowerName := strings.ToLower(name)
		if !info.IsDir() {
			ext := filepath.Ext(name)
			lowerName = strings.ToLower(strings.TrimSuffix(name, ext))
		}

		if _, ok := dirContents[dir]; !ok {
			dirContents[dir] = make(map[string]string)
		}

		if existingPath, ok := dirContents[dir][lowerName]; ok {
			// Conflict detected
			log.Printf("Conflict detected for name '%s' in directory '%s'. Paths: %s, %s", lowerName, dir, existingPath, path)

			var newPath string
			baseName := name
			ext := ""
			if !info.IsDir() {
				ext = filepath.Ext(name)
				baseName = strings.TrimSuffix(name, ext)
			}

			counter := 1
			for {
				newName := fmt.Sprintf("%s-%d%s", baseName, counter, ext)
				newPath = filepath.Join(dir, newName)
				if _, err := os.Stat(newPath); os.IsNotExist(err) {
					break
				}
				counter++
			}

			log.Printf("Renaming '%s' to '%s' to resolve conflict.", path, newPath)
			if err := os.Rename(path, newPath); err != nil {
				log.Printf("Error renaming conflicting item %s: %v", path, err)
				return nil // Continue walking
			}

			relOldPath, _ := filepath.Rel(dataDir, path)
			relNewPath, _ := filepath.Rel(dataDir, newPath)
			op := RenameOperation{OldPath: relOldPath, NewPath: relNewPath}
			operations = append(operations, op)
			logActivity(fmt.Sprintf("DATA INTEGRITY: Renamed '%s' to '%s'", relOldPath, relNewPath))

			// Update map with new path to avoid repeated conflicts in the same run
			dirContents[dir][strings.ToLower(strings.TrimSuffix(filepath.Base(newPath), filepath.Ext(newPath)))] = newPath

		} else {
			dirContents[dir][lowerName] = path
		}

		return nil
	})

	return operations, err
}

func main() {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("failed to create data directory: %v", err)
	}
	if err := os.MkdirAll(trashDir, 0755); err != nil {
		log.Fatalf("failed to create trash directory: %v", err)
	}
	if err := os.MkdirAll(imagesDir, 0755); err != nil {
		log.Fatalf("failed to create images directory: %v", err)
	}
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		log.Fatalf("failed to create logs directory: %v", err)
	}

	// Start background task to clean up expired links
	go cleanupExpiredLinks()

	r := mux.NewRouter()

	// API routes
	api := r.PathPrefix("/api/").Subrouter()
	api.HandleFunc("/documents/{id:.*}/rename", renameDocumentOrFolder).Methods("PUT")
	api.HandleFunc("/documents/{id:.*}", moveItemToTrash).Methods("DELETE")
	api.HandleFunc("/documents/{id:.*}", getDocument).Methods("GET")
	api.HandleFunc("/documents/{id:.*}", saveDocument).Methods("PUT")
	api.HandleFunc("/documents", listDocuments).Methods("GET")
	api.HandleFunc("/folders/{id:.*}", createFolder).Methods("POST")
	api.HandleFunc("/export/{id:.*}", exportHandler).Methods("GET")
	api.HandleFunc("/import", importHandler).Methods("POST")
	api.HandleFunc("/images", uploadImageHandler).Methods("POST")
	api.HandleFunc("/images", listImagesHandler).Methods("GET")
	api.HandleFunc("/images/{name}", deleteImageHandler).Methods("DELETE")
	api.HandleFunc("/trash", listTrashItems).Methods("GET")
	api.HandleFunc("/trash/restore/{id:.*}", restoreItemFromTrash).Methods("PUT")
	api.HandleFunc("/trash/delete/{id:.*}", deleteItemPermanently).Methods("DELETE")
	api.HandleFunc("/trash/empty", emptyTrash).Methods("DELETE")
	api.HandleFunc("/settings/resolve-conflicts", resolveConflictsHandler).Methods("POST")
	api.HandleFunc("/logs", getLogsHandler).Methods("GET")
	api.HandleFunc("/logs", clearLogsHandler).Methods("DELETE")
	api.HandleFunc("/references/{id:.*}", getReferencesHandler).Methods("GET")
	api.HandleFunc("/share/{id:.*}", createShareLinkHandler).Methods("POST")
	api.HandleFunc("/share", getShareLinksHandler).Methods("GET")
	api.HandleFunc("/share/{id}", updateShareLinkHandler).Methods("PUT")
	api.HandleFunc("/share/{id}", deleteShareLinkHandler).Methods("DELETE")

	// Public routes
	r.HandleFunc("/share/{id}", viewShareLinkHandler).Methods("GET")
	r.PathPrefix("/images/").Handler(http.StripPrefix("/images/", http.FileServer(http.Dir(imagesDir))))

	// SPA static file handler - this will serve js, css, etc.
	staticFileServer := http.FileServer(http.Dir("/app/frontend/build"))
	r.PathPrefix("/static/").Handler(staticFileServer)
	r.Handle("/favicon.ico", staticFileServer)
	r.Handle("/manifest.json", staticFileServer)
	r.Handle("/robots.txt", staticFileServer)
	r.Handle("/logo192.png", staticFileServer)
	r.Handle("/logo512.png", staticFileServer)

	// SPA catch-all handler for client-side routing.
	// This MUST be the last route defined.
	r.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "/app/frontend/build/index.html")
	})

	log.Printf("A Simple Data Flow server listening on port 8000...")
	log.Fatal(http.ListenAndServe(":8000", r))
}

const sharePageTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>%s</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f9f9f9; }
        .container { max-width: 800px; margin: 2rem auto; padding: 2rem; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); background-color: #fff; }
        h1, h2, h3 { border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
        code { background-color: #f0f0f0; padding: 2px 4px; border-radius: 4px; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace; }
        pre { background-color: #f0f0f0; padding: 1rem; border-radius: 6px; overflow-x: auto; }
        pre code { background-color: transparent; padding: 0; }
        blockquote { border-left: 4px solid #ddd; padding-left: 1rem; color: #666; }
        img { max-width: 100%%; height: auto; }
		table { border-collapse: collapse; width: 100%%; }
		th, td { border: 1px solid #ccc; padding: 8px 13px; }
		th { font-weight: bold; background-color: #f7f7f7; }
    </style>
</head>
<body>
    <div class="container" id="content"></div>
    <textarea id="markdown-content" style="display:none;">%s</textarea>
    <script>
        document.getElementById('content').innerHTML = marked.parse(document.getElementById('markdown-content').value);
    </script>
</body>
</html>
`

func viewShareLinkHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	linkID := vars["id"]

	links, err := loadShareLinks()
	if err != nil {
		http.Error(w, "Invalid link", http.StatusInternalServerError)
		return
	}

	var targetLink *ShareLink
	for i := range links {
		if links[i].ID == linkID {
			targetLink = &links[i]
			break
		}
	}

	if targetLink == nil {
		http.Error(w, "Link not found", http.StatusNotFound)
		return
	}

	if targetLink.ExpiresAt != nil && time.Now().After(*targetLink.ExpiresAt) {
		http.Error(w, "Link has expired", http.StatusForbidden)
		return
	}

	// This part is very similar to getDocument
	filePath := filepath.Join(dataDir, targetLink.DocumentPath)
	var foundPath string
	extensions := []string{".md", ".txt"} // Only share text-based files for now
	for _, ext := range extensions {
		if _, err := os.Stat(filePath + ext); err == nil {
			foundPath = filePath + ext
			break
		}
	}

	if foundPath == "" {
		http.Error(w, "Shared document not found", http.StatusNotFound)
		return
	}

	content, err := os.ReadFile(foundPath)
	if err != nil {
		http.Error(w, "Could not read shared document", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// Use backticks for multi-line string in Go
	fmt.Fprintf(w, sharePageTemplate, filepath.Base(targetLink.DocumentPath), string(content))
}

func createShareLinkHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	docID := decodePath(vars["id"])

	// Ensure the document exists
	filePath := filepath.Join(dataDir, docID)
	found := false
	extensions := []string{".md", ".txt"} // Only sharing text-based files for now
	for _, ext := range extensions {
		if _, err := os.Stat(filePath + ext); err == nil {
			found = true
			break
		}
	}
	if !found {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	links, err := loadShareLinks()
	if err != nil {
		http.Error(w, "Could not load share links", http.StatusInternalServerError)
		return
	}

	// Check if an active link already exists for this document
	now := time.Now()
	for _, link := range links {
		if link.DocumentPath == docID && (link.ExpiresAt == nil || now.Before(*link.ExpiresAt)) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(link)
			return // Return existing link
		}
	}

	// If no active link found, create a new one with 24h expiration
	id, err := generateRandomID(16)
	if err != nil {
		http.Error(w, "Could not generate link ID", http.StatusInternalServerError)
		return
	}

	expiresAt := time.Now().Add(24 * time.Hour)
	newLink := ShareLink{
		ID:           id,
		DocumentPath: docID,
		ExpiresAt:    &expiresAt,
	}

	links = append(links, newLink)
	if err := saveShareLinks(links); err != nil {
		http.Error(w, "Could not save share link", http.StatusInternalServerError)
		return
	}

	logActivity(fmt.Sprintf("SHARE: Created share link for '%s'", docID))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(newLink)
}

func getShareLinksHandler(w http.ResponseWriter, r *http.Request) {
	links, err := loadShareLinks()
	if err != nil {
		http.Error(w, "Could not load share links", http.StatusInternalServerError)
		return
	}

	var activeLinks []ShareLink
	now := time.Now()
	for _, link := range links {
		if link.ExpiresAt == nil || now.Before(*link.ExpiresAt) {
			activeLinks = append(activeLinks, link)
		}
	}

	if activeLinks == nil {
		activeLinks = []ShareLink{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(activeLinks)
}

func updateShareLinkHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	linkID := vars["id"]

	var req UpdateShareLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	links, err := loadShareLinks()
	if err != nil {
		http.Error(w, "Could not load share links", http.StatusInternalServerError)
		return
	}

	found := false
	for i := range links {
		if links[i].ID == linkID {
			found = true
			if req.Duration == "never" {
				links[i].ExpiresAt = nil
			} else {
				duration, err := time.ParseDuration(req.Duration)
				if err != nil {
					http.Error(w, "Invalid duration format", http.StatusBadRequest)
					return
				}
				newExpiry := time.Now().Add(duration)
				links[i].ExpiresAt = &newExpiry
			}
			break
		}
	}

	if !found {
		http.Error(w, "Link not found", http.StatusNotFound)
		return
	}

	if err := saveShareLinks(links); err != nil {
		http.Error(w, "Could not update share links", http.StatusInternalServerError)
		return
	}

	logActivity(fmt.Sprintf("SHARE: Updated expiration for link ID '%s'", linkID))

	w.WriteHeader(http.StatusOK)
}

func deleteShareLinkHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	linkID := vars["id"]

	links, err := loadShareLinks()
	if err != nil {
		http.Error(w, "Could not load share links", http.StatusInternalServerError)
		return
	}

	var updatedLinks []ShareLink
	var foundLink ShareLink
	for _, link := range links {
		if link.ID != linkID {
			updatedLinks = append(updatedLinks, link)
		} else {
			foundLink = link
		}
	}

	if len(updatedLinks) == len(links) {
		http.Error(w, "Link not found", http.StatusNotFound)
		return
	}

	if err := saveShareLinks(updatedLinks); err != nil {
		http.Error(w, "Could not update share links", http.StatusInternalServerError)
		return
	}

	logActivity(fmt.Sprintf("SHARE: Revoked share link for '%s'", foundLink.DocumentPath))
	w.WriteHeader(http.StatusOK)
}

func getReferencesHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	docID := decodePath(vars["id"])

	refs, err := loadReferences()
	if err != nil {
		http.Error(w, "Could not load references", http.StatusInternalServerError)
		return
	}

	backlinks, ok := refs[docID]
	if !ok {
		backlinks = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(backlinks)
}

func resolveConflictsHandler(w http.ResponseWriter, r *http.Request) {
	operations, err := resolveNameConflicts()
	if err != nil {
		log.Printf("Error resolving name conflicts: %v", err)
		http.Error(w, "Failed to resolve name conflicts", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(operations); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func getLogsHandler(w http.ResponseWriter, r *http.Request) {
	content, err := os.ReadFile(logFile)
	if err != nil {
		if os.IsNotExist(err) {
			w.Header().Set("Content-Type", "text/plain")
			w.Write([]byte("No logs found."))
			return
		}
		log.Printf("Error reading log file: %v", err)
		http.Error(w, "Failed to read log file", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	w.Write(content)
}

func clearLogsHandler(w http.ResponseWriter, r *http.Request) {
	if err := os.Truncate(logFile, 0); err != nil {
		if !os.IsNotExist(err) {
			log.Printf("Error clearing log file: %v", err)
			http.Error(w, "Failed to clear log file", http.StatusInternalServerError)
			return
		}
	}
	logActivity("LOGS: Activity log cleared.")
	w.WriteHeader(http.StatusOK)
}

// uploadImageHandler handles image uploads for the markdown editor.
func uploadImageHandler(w http.ResponseWriter, r *http.Request) {
	file, header, err := r.FormFile("image") // The editor uses 'image' as the field name
	if err != nil {
		http.Error(w, "Could not get image from form", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Create a unique filename to prevent collisions
	ext := filepath.Ext(header.Filename)
	uniqueFileName := time.Now().Format("20060102150405_") + strings.TrimSuffix(header.Filename, ext) + ext
	filePath := filepath.Join(imagesDir, uniqueFileName)

	// Create the file
	outFile, err := os.Create(filePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer outFile.Close()

	// Copy the uploaded file to the destination
	_, err = io.Copy(outFile, file)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Return the URL of the uploaded image
	response := map[string]string{
		"url": "/images/" + uniqueFileName,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func listImagesHandler(w http.ResponseWriter, r *http.Request) {
	var images []ImageFile
	files, err := os.ReadDir(imagesDir)
	if err != nil {
		http.Error(w, "Failed to read images directory", http.StatusInternalServerError)
		return
	}

	for _, file := range files {
		if !file.IsDir() {
			images = append(images, ImageFile{
				Name: file.Name(),
				URL:  "/images/" + file.Name(),
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(images)
}

func deleteImageHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]
	filePath := filepath.Join(imagesDir, name)

	// Basic security check to prevent path traversal
	if filepath.Dir(filePath) != imagesDir {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	if err := os.Remove(filePath); err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "Image not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to delete image", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// sortChildrenRecursively sorts file system items so folders appear before files,
// then alphabetically. It applies this sorting recursively to all children.
func sortChildrenRecursively(children []FileSystemItem) {
	if len(children) == 0 {
		return
	}

	sort.SliceStable(children, func(i, j int) bool {
		if children[i].Type == "folder" && children[j].Type == "file" {
			return true
		}
		if children[i].Type == "file" && children[j].Type == "folder" {
			return false
		}
		return children[i].Name < children[j].Name
	})

	for _, child := range children {
		if child.Type == "folder" {
			sortChildrenRecursively(child.Children)
		}
	}
}

func buildTree(basePath string) (FileSystemItem, error) {
	root := FileSystemItem{
		Name:     "Root",
		Path:     "",
		Type:     "folder",
		Children: []FileSystemItem{},
	}

	err := filepath.Walk(basePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if path == basePath {
			return nil
		}

		relPath, err := filepath.Rel(basePath, path)
		if err != nil {
			return err
		}

		// Ignore hidden files and the trash directory
		if strings.HasPrefix(relPath, ".") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		segments := strings.Split(relPath, string(os.PathSeparator))
		current := &root
		for i, segment := range segments {
			found := false
			for j := range current.Children {
				if current.Children[j].Name == segment {
					current = &current.Children[j]
					found = true
					break
				}
			}

			if !found {
				itemPath := strings.Join(segments[:i+1], string(os.PathSeparator))
				itemType := "folder"
				if !info.IsDir() && i == len(segments)-1 {
					itemType = "file"
					ext := filepath.Ext(itemPath)
					if ext != ".md" && ext != ".txt" && ext != ".png" && ext != ".jpg" && ext != ".jpeg" {
						return nil
					}
				}
				newItem := FileSystemItem{Name: segment, Path: itemPath, Type: itemType, Children: []FileSystemItem{}}
				if itemType == "file" {
					ext := filepath.Ext(segment)
					newItem.Name = strings.TrimSuffix(segment, ext)
					newItem.Path = strings.TrimSuffix(itemPath, ext)
				}

				current.Children = append(current.Children, newItem)
				current = &current.Children[len(current.Children)-1]
			}
		}

		return nil
	})

	// Recursively sort all children so folders come before files, then alphabetically.
	sortChildrenRecursively(root.Children)

	return root, err
}

func listDocuments(w http.ResponseWriter, r *http.Request) {
	tree, err := buildTree(dataDir)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(tree.Children); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func getDocument(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	docID := decodePath(vars["id"])
	filePath := filepath.Join(dataDir, docID)

	if !strings.HasPrefix(filePath, dataDir) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	// Check for supported file types first
	var foundPath string
	extensions := []string{".md", ".txt", ".png", ".jpg", ".jpeg"}
	for _, ext := range extensions {
		if _, err := os.Stat(filePath + ext); err == nil {
			foundPath = filePath + ext
			break
		}
	}

	// If no file found, check if it's a directory
	if foundPath == "" {
		if info, err := os.Stat(filePath); err == nil && info.IsDir() {
			http.Error(w, "path is a directory", http.StatusBadRequest)
			return
		}
		http.Error(w, "document not found", http.StatusNotFound)
		return
	}

	content, err := os.ReadFile(foundPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ext := filepath.Ext(foundPath)
	contentType := "text/plain"
	switch ext {
	case ".md":
		contentType = "text/markdown"
	case ".txt":
		contentType = "text/plain"
	case ".png":
		contentType = "image/png"
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	}

	w.Header().Set("Content-Type", contentType)
	w.Write(content)
}

func saveDocument(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	docID := decodePath(vars["id"])
	filePath := filepath.Join(dataDir, docID)

	if !strings.HasPrefix(filePath, dataDir) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	newBaseName := strings.TrimSuffix(filepath.Base(docID), filepath.Ext(docID))

	// Check for a case-insensitive conflict with existing files or folders.
	// The path to exclude is the new one with the .md extension, as we are creating or overwriting this specific file.
	if exists, err := existsCaseInsensitive(dir, newBaseName, filePath+".md"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	} else if exists {
		http.Error(w, "An item with the same name already exists in this folder.", http.StatusConflict)
		return
	}

	finalPath := filePath + ".md"

	content, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "could not read request body", http.StatusInternalServerError)
		return
	}

	if err := os.WriteFile(finalPath, content, 0644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := updateReferencesForFile(docID, content); err != nil {
		log.Printf("Failed to update references for %s: %v", docID, err)
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func moveItemToTrash(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	itemPath := decodePath(vars["id"])
	filePath := filepath.Join(dataDir, itemPath)

	if !strings.HasPrefix(filePath, dataDir) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	info, err := os.Stat(filePath)
	if err != nil {
		// If it doesn't exist, try with supported extensions
		extensions := []string{".md", ".txt", ".png", ".jpg", ".jpeg"}
		found := false
		for _, ext := range extensions {
			if _, err := os.Stat(filePath + ext); err == nil {
				filePath += ext
				info, _ = os.Stat(filePath)
				found = true
				break
			}
		}
		if !found {
			http.Error(w, "item not found", http.StatusNotFound)
			return
		}
	}

	trashPath := filepath.Join(trashDir, filepath.Base(filePath))
	// Add a timestamp to avoid name collisions in the trash folder
	if !info.IsDir() {
		ext := filepath.Ext(trashPath)
		trashPath = trashPath[0:len(trashPath)-len(ext)] + "_" + time.Now().Format("20060102150405") + ext
	} else {
		trashPath += "_" + time.Now().Format("20060102150405")
	}

	if err := os.Rename(filePath, trashPath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	relPath, _ := filepath.Rel(dataDir, filePath)
	relPathWithoutExt := strings.TrimSuffix(relPath, filepath.Ext(relPath))
	if err := removeReferencesForFile(relPathWithoutExt); err != nil {
		log.Printf("Failed to remove references for %s: %v", relPathWithoutExt, err)
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func renameDocumentOrFolder(w http.ResponseWriter, r *http.Request) {
	type RenameRequest struct {
		NewPath string `json:"newPath"`
	}

	var req RenameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	oldRelativePath := decodePath(vars["id"])
	oldFullPath := filepath.Join(dataDir, oldRelativePath)

	info, err := os.Stat(oldFullPath)
	if err != nil {
		extensions := []string{".md", ".txt", ".png", ".jpg", ".jpeg"}
		found := false
		for _, ext := range extensions {
			if stat, err := os.Stat(oldFullPath + ext); err == nil {
				oldFullPath += ext
				info = stat
				found = true
				break
			}
		}
		if !found {
			http.Error(w, "item not found", http.StatusNotFound)
			return
		}
	}

	newRelativePath := decodePath(req.NewPath)
	var newFullPath string
	if info.IsDir() {
		newFullPath = filepath.Join(dataDir, newRelativePath)
	} else {
		ext := filepath.Ext(oldFullPath)
		newFullPath = filepath.Join(dataDir, newRelativePath+ext)
	}

	if !strings.HasPrefix(newFullPath, dataDir) {
		http.Error(w, "invalid new path", http.StatusBadRequest)
		return
	}

	newBaseName := strings.TrimSuffix(filepath.Base(newRelativePath), filepath.Ext(newRelativePath))
	newDir := filepath.Dir(newFullPath)

	if exists, err := existsCaseInsensitive(newDir, newBaseName, oldFullPath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	} else if exists {
		http.Error(w, "An item with the same name already exists in the destination.", http.StatusConflict)
		return
	}

	if err := os.MkdirAll(newDir, 0755); err != nil {
		http.Error(w, "Could not create destination directory: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err := os.Rename(oldFullPath, newFullPath); err != nil {
		http.Error(w, "Could not rename/move item: "+err.Error(), http.StatusInternalServerError)
		return
	}

	oldRelPathNoExt := strings.TrimSuffix(oldRelativePath, filepath.Ext(oldFullPath))
	newRelPathNoExt := strings.TrimSuffix(newRelativePath, filepath.Ext(newFullPath))

	if err := updateReferencesForRename(oldRelPathNoExt, newRelPathNoExt, info.IsDir()); err != nil {
		log.Printf("Failed to update references on rename: %v", err)
	}

	relOldPath, _ := filepath.Rel(dataDir, oldFullPath)
	relNewPath, _ := filepath.Rel(dataDir, newFullPath)
	logActivity(fmt.Sprintf("MOVE/RENAME: Moved '%s' to '%s'", relOldPath, relNewPath))

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func createFolder(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	folderPath := decodePath(vars["id"])
	fullPath := filepath.Join(dataDir, folderPath)

	if !strings.HasPrefix(fullPath, dataDir) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	newFolderName := filepath.Base(fullPath)
	dirPath := filepath.Dir(fullPath)

	// Check for a case-insensitive conflict before creating the folder.
	if exists, err := existsCaseInsensitive(dirPath, newFolderName, ""); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	} else if exists {
		http.Error(w, "A file or folder with the same name already exists (case-insensitive)", http.StatusConflict)
		return
	}

	if err := os.MkdirAll(fullPath, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func zipSource(source string, zipWriter *zip.Writer) error {
	return filepath.Walk(source, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		relPath, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = relPath

		writer, err := zipWriter.CreateHeader(header)
		if err != nil {
			return err
		}

		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()

		_, err = io.Copy(writer, file)
		return err
	})
}

// exportHandler exports a single file or a zip of a folder or the entire data directory.
func exportHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	path := decodePath(vars["id"])

	if path == "" { // Export all as zip
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", "attachment; filename=\"export.zip\"")
		zipWriter := zip.NewWriter(w)
		defer zipWriter.Close()
		zipSource(dataDir, zipWriter)
		return
	}

	// For single file or folder export
	itemPath := filepath.Join(dataDir, path)
	if !strings.HasPrefix(itemPath, dataDir) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	info, err := os.Stat(itemPath)
	// Try with supported extensions
	extensions := []string{".md", ".txt", ".png", ".jpg", ".jpeg"}
	found := false
	if os.IsNotExist(err) {
		for _, ext := range extensions {
			if _, err := os.Stat(itemPath + ext); err == nil {
				itemPath += ext
				info, _ = os.Stat(itemPath)
				found = true
				break
			}
		}
	} else {
		found = true
	}

	if err != nil && !found {
		http.Error(w, "Item not found", http.StatusNotFound)
		return
	}

	if info.IsDir() { // Export folder as zip
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", "attachment; filename=\""+info.Name()+".zip\"")
		zipWriter := zip.NewWriter(w)
		defer zipWriter.Close()
		zipSource(itemPath, zipWriter)
	} else { // Export single file
		file, err := os.Open(itemPath)
		if err != nil {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		defer file.Close()

		w.Header().Set("Content-Disposition", "attachment; filename=\""+info.Name()+"\"")
		http.ServeFile(w, r, itemPath)
	}
}

func importHandler(w http.ResponseWriter, r *http.Request) {
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Could not get file from form", http.StatusBadRequest)
		return
	}
	defer file.Close()

	fileName := header.Filename
	filePath := filepath.Join(dataDir, fileName)

	if strings.HasSuffix(fileName, ".zip") {
		var buf bytes.Buffer
		io.Copy(&buf, file)
		zipReader, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
		if err != nil {
			http.Error(w, "Invalid zip file", http.StatusBadRequest)
			return
		}

		for _, f := range zipReader.File {
			if f.FileInfo().IsDir() {
				continue
			}

			path := filepath.Join(dataDir, f.Name)
			if !strings.HasPrefix(path, dataDir) {
				http.Error(w, "Invalid path in zip file", http.StatusBadRequest)
				return
			}

			if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			writer, err := os.Create(path)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer writer.Close()

			reader, err := f.Open()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer reader.Close()

			io.Copy(writer, reader)
		}

	} else if strings.HasSuffix(fileName, ".md") || strings.HasSuffix(fileName, ".txt") {
		// New check for importing single files
		newBaseName := strings.TrimSuffix(fileName, filepath.Ext(fileName))
		dirPath := filepath.Dir(filePath)
		if exists, err := existsCaseInsensitive(dirPath, newBaseName, ""); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		} else if exists {
			http.Error(w, "An item with the same name already exists (case-insensitive)", http.StatusConflict)
			return
		}

		outFile, err := os.Create(filePath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer outFile.Close()
		io.Copy(outFile, file)
	} else {
		http.Error(w, "Only .md, .txt, and .zip files are supported", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// Recycle Bin Handlers

func listTrashItems(w http.ResponseWriter, r *http.Request) {
	var items []FileSystemItem
	files, err := os.ReadDir(trashDir)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	for _, file := range files {
		itemType := "file"
		if file.IsDir() {
			itemType = "folder"
		}
		items = append(items, FileSystemItem{
			Name: file.Name(),
			Path: file.Name(),
			Type: itemType,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

func restoreItemFromTrash(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	trashPath := filepath.Join(trashDir, id)

	// Original logic to remove timestamp from restorePath
	restorePath := filepath.Join(dataDir, id)
	ext := filepath.Ext(restorePath)
	if ext != "" {
		base := restorePath[0 : len(restorePath)-len(ext)]
		if len(base) > 15 {
			timestamp := base[len(base)-15:]
			if _, err := time.Parse("_20060102150405", timestamp); err == nil {
				restorePath = base[0:len(base)-15] + ext
			}
		}
	} else if len(restorePath) > 15 {
		timestamp := restorePath[len(restorePath)-15:]
		if _, err := time.Parse("_20060102150405", timestamp); err == nil {
			restorePath = restorePath[0 : len(restorePath)-15]
		}
	}

	// Check for conflict at the destination before restoring
	restoreDir := filepath.Dir(restorePath)
	restoreBaseName := strings.TrimSuffix(filepath.Base(restorePath), filepath.Ext(restorePath))
	if exists, err := existsCaseInsensitive(restoreDir, restoreBaseName, ""); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	} else if exists {
		http.Error(w, "An item with the same name already exists in the destination folder.", http.StatusConflict)
		return
	}

	if err := os.Rename(trashPath, restorePath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	relPath, _ := filepath.Rel(dataDir, restorePath)
	content, err := os.ReadFile(restorePath)
	if err == nil {
		if err := updateReferencesForFile(strings.TrimSuffix(relPath, filepath.Ext(relPath)), content); err != nil {
			log.Printf("Failed to update references for restored file %s: %v", relPath, err)
		}
	}

	w.WriteHeader(http.StatusOK)
}

func deleteItemPermanently(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	trashPath := filepath.Join(trashDir, id)

	info, err := os.Stat(trashPath)
	if err != nil {
		http.Error(w, "item not found in trash", http.StatusNotFound)
		return
	}

	// The 'id' from the request includes the timestamp. We need the original path.
	originalPath := id
	ext := filepath.Ext(originalPath)
	if ext != "" {
		base := originalPath[0 : len(originalPath)-len(ext)]
		if len(base) > 15 {
			timestamp := base[len(base)-15:]
			if _, err := time.Parse("_20060102150405", timestamp); err == nil {
				originalPath = base[0:len(base)-15] + ext
			}
		}
	} else if len(originalPath) > 15 {
		timestamp := originalPath[len(originalPath)-15:]
		if _, err := time.Parse("_20060102150405", timestamp); err == nil {
			originalPath = originalPath[0 : len(originalPath)-15]
		}
	}

	if err := removeReferencesForFile(strings.TrimSuffix(originalPath, filepath.Ext(originalPath))); err != nil {
		log.Printf("Failed to remove references for permanently deleted file %s: %v", originalPath, err)
	}

	if info.IsDir() {
		err = os.RemoveAll(trashPath)
	} else {
		err = os.Remove(trashPath)
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func emptyTrash(w http.ResponseWriter, r *http.Request) {
	dir, err := os.ReadDir(trashDir)
	if err != nil {
		http.Error(w, "Failed to read trash directory", http.StatusInternalServerError)
		return
	}
	for _, d := range dir {
		os.RemoveAll(filepath.Join(trashDir, d.Name()))
	}
	// After emptying trash, we should ideally clear all references from trashed items
	// But without a record of what was in the trash, this is hard.
	// For now, references will point to non-existent files which is acceptable.
	w.WriteHeader(http.StatusOK)
}


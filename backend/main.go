package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
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

	r := mux.NewRouter()

	// API routes must be registered before the SPA handler
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

	// Serve static assets for images
	r.PathPrefix("/images/").Handler(http.StripPrefix("/images/", http.FileServer(http.Dir(imagesDir))))

	// SPA Handler: Serves the React app and handles client-side routing
	// This should be the last handler
	r.PathPrefix("/").Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		staticPath := "/app/frontend/build"
		indexPath := "index.html"

		// Check if the file exists in the static path
		filePath := filepath.Join(staticPath, r.URL.Path)
		_, err := os.Stat(filePath)
		if os.IsNotExist(err) {
			// If the file does not exist, serve the index.html
			http.ServeFile(w, r, filepath.Join(staticPath, indexPath))
			return
		}

		// Otherwise, serve the static file
		http.FileServer(http.Dir(staticPath)).ServeHTTP(w, r)
	}))

	log.Printf("A Simple Data Flow server listening on port 8000...")
	log.Fatal(http.ListenAndServe(":8000", r))
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

	// Sort children so files come before folders
	sort.SliceStable(root.Children, func(i, j int) bool {
		if root.Children[i].Type == "file" && root.Children[j].Type == "folder" {
			return true
		}
		if root.Children[i].Type == "folder" && root.Children[j].Type == "file" {
			return false
		}
		return root.Children[i].Name < root.Children[j].Name
	})

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
	w.WriteHeader(http.StatusOK)
}


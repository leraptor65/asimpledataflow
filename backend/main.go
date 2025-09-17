package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
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
var imagesDir = "/app/data/images"

// FileSystemItem represents a file or folder in the directory tree.
type FileSystemItem struct {
	Name     string           `json:"name"`
	Path     string           `json:"path"`
	Type     string           `json:"type"`
	Children []FileSystemItem `json:"children,omitempty"`
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

	r := mux.NewRouter()
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

	api.HandleFunc("/trash", listTrashItems).Methods("GET")
	api.HandleFunc("/trash/restore/{id:.*}", restoreItemFromTrash).Methods("PUT")
	api.HandleFunc("/trash/delete/{id:.*}", deleteItemPermanently).Methods("DELETE")

	r.PathPrefix("/images/").Handler(http.StripPrefix("/images/", http.FileServer(http.Dir(imagesDir))))
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("/app/frontend/build")))
	log.Printf("A Simple Data Flow server listening on port 8000...")
	log.Fatal(http.ListenAndServe(":8000", r))
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
	docID := vars["id"]
	filePath := filepath.Join(dataDir, docID)

	if !strings.HasPrefix(filePath, dataDir) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	// Check for supported file types and serve them with the correct content type
	extensions := []string{".md", ".txt", ".png", ".jpg", ".jpeg"}
	for _, ext := range extensions {
		if _, err := os.Stat(filePath + ext); err == nil {
			filePath = filePath + ext
			break
		}
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "document not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ext := filepath.Ext(filePath)
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
	docID := vars["id"]
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

	// Add .md extension for new files, and check for conflicts
	if _, err := os.Stat(filePath + ".md"); err != nil {
		files, err := os.ReadDir(dir)
		if err == nil {
			for _, file := range files {
				if strings.EqualFold(file.Name(), filepath.Base(filePath)+".md") {
					http.Error(w, "a file with the same name already exists (case-insensitive)", http.StatusConflict)
					return
				}
			}
		}
		filePath += ".md"
	} else {
		filePath += ".md"
	}

	content, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "could not read request body", http.StatusInternalServerError)
		return
	}

	if err := os.WriteFile(filePath, content, 0644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func moveItemToTrash(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	itemPath := vars["id"]
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
	// Add a timestamp to avoid name collisions
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
	oldPath := vars["id"]
	oldFilePath := filepath.Join(dataDir, oldPath)

	// Determine if the old path is a directory or a file, and get the correct full path
	info, err := os.Stat(oldFilePath)
	if err != nil {
		extensions := []string{".md", ".txt", ".png", ".jpg", ".jpeg"}
		found := false
		for _, ext := range extensions {
			if stat, err := os.Stat(oldFilePath + ext); err == nil {
				oldFilePath += ext
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

	// Create the new path, preserving the original directory
	var newFilePath string
	if info.IsDir() {
		newFilePath = filepath.Join(filepath.Dir(oldFilePath), req.NewPath)
	} else {
		ext := filepath.Ext(oldFilePath)
		newFilePath = filepath.Join(filepath.Dir(oldFilePath), req.NewPath+ext)
	}

	if !strings.HasPrefix(newFilePath, dataDir) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	// Case-insensitive check for destination
	dir := filepath.Dir(newFilePath)
	files, err := os.ReadDir(dir)
	if err == nil {
		for _, file := range files {
			if strings.EqualFold(file.Name(), filepath.Base(newFilePath)) {
				http.Error(w, "a file or folder with the same name already exists (case-insensitive)", http.StatusConflict)
				return
			}
		}
	}

	// Ensure destination directory exists
	if err := os.MkdirAll(filepath.Dir(newFilePath), 0755); err != nil {
		http.Error(w, "could not create destination directory: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Rename the file or folder
	if err := os.Rename(oldFilePath, newFilePath); err != nil {
		http.Error(w, "could not move item: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func createFolder(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	folderPath := vars["id"]
	fullPath := filepath.Join(dataDir, folderPath)
	
	if !strings.HasPrefix(fullPath, dataDir) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	// Case-insensitive check
	dir := filepath.Dir(fullPath)
	files, err := os.ReadDir(dir)
	if err == nil {
		for _, file := range files {
			if strings.EqualFold(file.Name(), filepath.Base(fullPath)) {
				http.Error(w, "a file or folder with the same name already exists (case-insensitive)", http.StatusConflict)
				return
			}
		}
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
	path := vars["id"]

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
		w.Header().Set("Content-Disposition", "attachment; filename=\""+ info.Name() +".zip\"")
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

		w.Header().Set("Content-Disposition", "attachment; filename=\""+ info.Name() +"\"")
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
    restorePath := filepath.Join(dataDir, id)

	// Remove timestamp from filename if it exists
	ext := filepath.Ext(restorePath)
	if ext != "" {
		base := restorePath[0:len(restorePath)-len(ext)]
		if len(base) > 15 {
			timestamp := base[len(base)-15:]
			if _, err := time.Parse("_20060102150405", timestamp); err == nil {
				restorePath = base[0:len(base)-15] + ext
			}
		}
	} else if len(restorePath) > 15 { // For directories
		timestamp := restorePath[len(restorePath)-15:]
		if _, err := time.Parse("_20060102150405", timestamp); err == nil {
			restorePath = restorePath[0:len(restorePath)-15]
		}
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
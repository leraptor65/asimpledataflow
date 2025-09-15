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
	"strings"

	"github.com/gorilla/mux"
)

// The path to the directory where markdown files are stored.
var dataDir = "/app/data"

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

	r := mux.NewRouter()
	api := r.PathPrefix("/api/").Subrouter()

	api.HandleFunc("/documents/{id:.*}/rename", renameDocumentOrFolder).Methods("PUT")
	api.HandleFunc("/documents/{id:.*}", deleteDocumentOrFolder).Methods("DELETE")
	api.HandleFunc("/documents/{id:.*}", getDocument).Methods("GET")
	api.HandleFunc("/documents/{id:.*}", saveDocument).Methods("PUT")

	api.HandleFunc("/documents", listDocuments).Methods("GET")
	api.HandleFunc("/folders/{id:.*}", createFolder).Methods("POST")
	api.HandleFunc("/export/{id:.*}", exportHandler).Methods("GET")
	api.HandleFunc("/import", importHandler).Methods("POST")

	r.PathPrefix("/").Handler(http.FileServer(http.Dir("/app/frontend/build")))
	log.Printf("A Simple Data Flow server listening on port 8000...")
	log.Fatal(http.ListenAndServe(":8000", r))
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
					if !strings.HasSuffix(itemPath, ".md") {
						return nil
					}
					itemPath = strings.TrimSuffix(itemPath, ".md")
				}
				newItem := FileSystemItem{Name: segment, Path: itemPath, Type: itemType}
				current.Children = append(current.Children, newItem)
				current = &current.Children[len(current.Children)-1]
			}
		}

		return nil
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
	docID := vars["id"] + ".md"
	filePath := filepath.Join(dataDir, docID)
	
	if !strings.HasPrefix(filePath, dataDir) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
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

	w.Header().Set("Content-Type", "text/markdown")
	w.Write(content)
}

func saveDocument(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	docID := vars["id"] + ".md"
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

func deleteDocumentOrFolder(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	itemPath := vars["id"]
	filePath := filepath.Join(dataDir, itemPath)
	
	if !strings.HasPrefix(filePath, dataDir) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	
	info, err := os.Stat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			info, err = os.Stat(filePath + ".md")
			if err != nil {
				http.Error(w, "item not found", http.StatusNotFound)
				return
			}
			filePath = filePath + ".md"
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	if info.IsDir() {
		if err := os.RemoveAll(filePath); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		if err := os.Remove(filePath); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
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
	newFilePath := filepath.Join(dataDir, req.NewPath)

	if !strings.HasPrefix(oldFilePath, dataDir) || !strings.HasPrefix(newFilePath, dataDir) {
		http.Error(w, "invalid paths", http.StatusBadRequest)
		return
	}
	
	info, err := os.Stat(oldFilePath)
	if err != nil {
		info, err = os.Stat(oldFilePath + ".md")
		if err != nil || info.IsDir() {
			http.Error(w, "item not found", http.StatusNotFound)
			return
		}
		oldFilePath = oldFilePath + ".md"
	}
	
	if strings.HasSuffix(oldFilePath, ".md") && !strings.HasSuffix(newFilePath, ".md") {
		newFilePath = newFilePath + ".md"
	}
	
	if _, err := os.Stat(newFilePath); err == nil {
		http.Error(w, "destination path already exists", http.StatusConflict)
		return
	}
	
	if err := os.MkdirAll(filepath.Dir(newFilePath), 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	if err := os.Rename(oldFilePath, newFilePath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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

	if err := os.MkdirAll(fullPath, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// exportHandler exports a single file or a zip of the entire data directory.
func exportHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	path := vars["id"]

	if path == "" { // Export all as zip
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", "attachment; filename=\"export.zip\"")

		zipWriter := zip.NewWriter(w)
		defer zipWriter.Close()

		filepath.Walk(dataDir, func(p string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}

			if info.IsDir() {
				return nil
			}

			relPath, err := filepath.Rel(dataDir, p)
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

			reader, err := os.Open(p)
			if err != nil {
				return err
			}
			defer reader.Close()

			_, err = io.Copy(writer, reader)
			return err
		})
		return
	}

	// For single file export
	filePath := filepath.Join(dataDir, path)
	if !strings.HasPrefix(filePath, dataDir) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	
	file, err := os.Open(filePath + ".md")
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", "text/markdown")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+ filepath.Base(path) +".md\"")
	io.Copy(w, file)
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
		
	} else if strings.HasSuffix(fileName, ".md") {
		outFile, err := os.Create(filePath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer outFile.Close()
		io.Copy(outFile, file)
	} else {
		http.Error(w, "Only .md and .zip files are supported", http.StatusBadRequest)
		return
	}
	
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}
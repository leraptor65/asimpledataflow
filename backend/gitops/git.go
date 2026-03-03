package gitops

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

type CommitInfo struct {
	Hash    string    `json:"hash"`
	Message string    `json:"message"`
	Author  string    `json:"author"`
	Date    time.Time `json:"date"`
}

type GitManager struct {
	dataDir string
}

func NewGitManager(dataDir string) *GitManager {
	return &GitManager{dataDir: dataDir}
}

func (g *GitManager) InitRepo() *git.Repository {
	repo, err := git.PlainInit(g.dataDir, false)
	if err != nil && err != git.ErrRepositoryAlreadyExists {
		log.Printf("Error initializing git repo: %v", err)
		return nil
	} else if err == git.ErrRepositoryAlreadyExists {
		repo, err = git.PlainOpen(g.dataDir)
		if err != nil {
			log.Printf("Error opening git repo: %v", err)
			return nil
		}
	} else {
		log.Println("Initialized new git repository in data directory")
	}
	return repo
}

func (g *GitManager) CommitFile(filename string, message string) {
	repo := g.InitRepo()
	if repo == nil {
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		log.Printf("Error getting worktree: %v", err)
		return
	}

	_, err = w.Add(filename)
	if err != nil {
		log.Printf("Error adding file to index: %v", err)
		return
	}

	_, err = w.Commit(message, &git.CommitOptions{
		Author: &object.Signature{
			Name:  "App User",
			Email: "app@local",
			When:  time.Now(),
		},
	})

	if err != nil {
		log.Printf("Error committing: %v", err)
	}
}

func (g *GitManager) CommitAll(message string) {
	repo := g.InitRepo()
	if repo == nil {
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		log.Printf("Error getting worktree: %v", err)
		return
	}

	err = w.AddWithOptions(&git.AddOptions{All: true})
	if err != nil {
		log.Printf("Error adding all to index: %v", err)
		return
	}

	_, err = w.Commit(message, &git.CommitOptions{
		Author: &object.Signature{
			Name:  "App User",
			Email: "app@local",
			When:  time.Now(),
		},
	})

	if err != nil {
		log.Printf("Error committing all: %v", err)
	}
}

func (g *GitManager) GetFileHistory(filename string) ([]CommitInfo, error) {
	repo := g.InitRepo()
	if repo == nil {
		return nil, fmt.Errorf("failed to init repo")
	}

	cIter, err := repo.Log(&git.LogOptions{
		FileName: &filename,
	})
	if err != nil {
		return nil, err
	}

	var commits []CommitInfo
	err = cIter.ForEach(func(c *object.Commit) error {
		commits = append(commits, CommitInfo{
			Hash:    c.Hash.String(),
			Message: c.Message,
			Author:  c.Author.Name,
			Date:    c.Author.When,
		})
		return nil
	})
	return commits, err
}

func (g *GitManager) CheckoutFile(hash string, filename string) error {
	repo := g.InitRepo()
	if repo == nil {
		return fmt.Errorf("failed to init repo")
	}

	h := plumbing.NewHash(hash)
	c, err := repo.CommitObject(h)
	if err != nil {
		return err
	}

	f, err := c.File(filename)
	if err != nil {
		return err
	}

	content, err := f.Contents()
	if err != nil {
		return err
	}

	fullPath := filepath.Join(g.dataDir, filename)
	err = os.WriteFile(fullPath, []byte(content), 0644)
	if err != nil {
		return err
	}

	g.CommitFile(filename, "Revert "+filename+" to "+hash[:7])
	return nil
}

func (g *GitManager) GetFileContentAtHash(hash string, filename string) (string, error) {
	repo := g.InitRepo()
	if repo == nil {
		return "", fmt.Errorf("failed to init repo")
	}

	h := plumbing.NewHash(hash)
	c, err := repo.CommitObject(h)
	if err != nil {
		return "", err
	}

	f, err := c.File(filename)
	if err != nil {
		// If file doesn't exist in that commit, return empty
		return "", nil
	}

	content, err := f.Contents()
	if err != nil {
		return "", err
	}

	return content, nil
}

package gitops

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/transport/http"
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

	// Try to pull remote changes first if GitHub sync is configured
	g.pullFromRemote(repo)

	_, err = w.Add(filename)
	if err != nil {
		log.Printf("Error adding file to index: %v", err)
		return
	}

	_, err = w.Commit(message, &git.CommitOptions{
		Author: g.getAuthorSignature(),
	})

	if err != nil {
		log.Printf("Error committing: %v", err)
	} else {
		// Try to push to remote if GitHub sync is configured
		g.pushToRemote(repo)
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

	// Try to pull remote changes first if GitHub sync is configured
	g.pullFromRemote(repo)

	err = w.AddWithOptions(&git.AddOptions{All: true})
	if err != nil {
		log.Printf("Error adding all to index: %v", err)
		return
	}

	_, err = w.Commit(message, &git.CommitOptions{
		Author: g.getAuthorSignature(),
	})

	if err != nil {
		log.Printf("Error committing all: %v", err)
	} else {
		// Try to push to remote if GitHub sync is configured
		g.pushToRemote(repo)
	}
}

// getGHToken retrieves the GitHub auth token by running `gh auth token`.
// Returns an empty string if gh is not installed or user is not authenticated.
func getGHToken() string {
	cmd := exec.Command("gh", "auth", "token")
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = nil
	if err := cmd.Run(); err != nil {
		return ""
	}
	return strings.TrimSpace(out.String())
}

// getGitConfig retrieves a git config value by running `git config --get <key>`.
// Returns an empty string if the key is not set.
func getGitConfig(key string) string {
	cmd := exec.Command("git", "config", "--get", key)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = nil
	if err := cmd.Run(); err != nil {
		return ""
	}
	return strings.TrimSpace(out.String())
}

// GetGHAuthStatus runs `gh auth status` and returns the combined output.
func GetGHAuthStatus() (string, error) {
	cmd := exec.Command("gh", "auth", "status")
	var combined bytes.Buffer
	cmd.Stdout = &combined
	cmd.Stderr = &combined
	err := cmd.Run()
	return strings.TrimSpace(combined.String()), err
}

func (g *GitManager) getAuthorSignature() *object.Signature {
	name := getGitConfig("user.name")
	if name == "" {
		name = "App User"
	}
	email := getGitConfig("user.email")
	if email == "" {
		email = "app@local"
	}
	return &object.Signature{
		Name:  name,
		Email: email,
		When:  time.Now(),
	}
}

func (g *GitManager) pullFromRemote(repo *git.Repository) {
	if g.isSyncDisabled() {
		log.Println("GitHub Sync: sync is disabled in settings. Skipping pull.")
		return
	}
	repoURL := os.Getenv("GITHUB_REPO")
	if repoURL == "" {
		return // Remote not configured, skip pull
	}

	token := getGHToken()

	w, err := repo.Worktree()
	if err != nil {
		log.Printf("GitHub Sync: failed to get worktree for pull: %v", err)
		g.WriteSyncLog("Pull", err)
		return
	}

	// Prepare remote tracking and fetch origin if not defined
	remoteName := "origin"
	remotes, err := repo.Remotes()
	if err == nil {
		originExists := false
		for _, r := range remotes {
			if r.Config().Name == remoteName {
				originExists = true
				break
			}
		}
		if !originExists {
			_, err = repo.CreateRemote(&config.RemoteConfig{
				Name: remoteName,
				URLs: []string{repoURL},
			})
			if err != nil {
				log.Printf("GitHub Sync: failed to create remote on pull: %v", err)
				g.WriteSyncLog("Pull", err)
				return
			}
		}
	}

	var auth *http.BasicAuth
	if token != "" {
		auth = &http.BasicAuth{
			Username: "git",
			Password: token,
		}
	}

	log.Println("GitHub Sync: pulling latest updates from remote...")
	err = w.Pull(&git.PullOptions{
		RemoteName: remoteName,
		Auth:       auth,
	})
	if err != nil {
		if err == git.NoErrAlreadyUpToDate {
			log.Println("GitHub Sync: local repository is up to date.")
			g.WriteSyncLog("Pull", nil)
		} else if err == git.ErrNonFastForwardUpdate {
			log.Println("GitHub Sync: warning: remote changes could not be fast-forwarded. Manual merge required.")
			g.WriteSyncLog("Pull", err)
		} else {
			log.Printf("GitHub Sync: warning: pull failed: %v. Local repository remains operational.", err)
			g.WriteSyncLog("Pull", err)
		}
	} else {
		log.Println("GitHub Sync: successfully pulled remote changes!")
		g.WriteSyncLog("Pull", nil)
	}
}

func (g *GitManager) pushToRemote(repo *git.Repository) {
	if g.isSyncDisabled() {
		log.Println("GitHub Sync: sync is disabled in settings. Skipping push.")
		return
	}
	repoURL := os.Getenv("GITHUB_REPO")
	if repoURL == "" {
		return // Remote not configured, skip push
	}

	token := getGHToken()

	remoteName := "origin"
	remotes, err := repo.Remotes()
	if err != nil {
		log.Printf("GitHub Sync: failed to list remotes on push: %v", err)
		g.WriteSyncLog("Push", err)
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
		_, err = repo.CreateRemote(&config.RemoteConfig{
			Name: remoteName,
			URLs: []string{repoURL},
		})
		if err != nil {
			log.Printf("GitHub Sync: failed to create remote on push: %v", err)
			g.WriteSyncLog("Push", err)
			return
		}
	}

	var auth *http.BasicAuth
	if token != "" {
		auth = &http.BasicAuth{
			Username: "git",
			Password: token,
		}
	}

	log.Printf("GitHub Sync: pushing commits to remote repository %s...", repoURL)
	headRef, err := repo.Head()
	pushOpts := &git.PushOptions{
		RemoteName: remoteName,
		Auth:       auth,
	}
	if err == nil {
		refSpec := config.RefSpec(fmt.Sprintf("%s:%s", headRef.Name(), headRef.Name()))
		pushOpts.RefSpecs = []config.RefSpec{refSpec}
	}

	err = repo.Push(pushOpts)
	if err != nil {
		if err == git.NoErrAlreadyUpToDate {
			log.Println("GitHub Sync: already up-to-date.")
			g.WriteSyncLog("Push", nil)
		} else {
			log.Printf("GitHub Sync: warning: push failed: %v. Local repository remains operational.", err)
			g.WriteSyncLog("Push", err)
		}
	} else {
		log.Println("GitHub Sync: successfully pushed to GitHub!")
		g.WriteSyncLog("Push", nil)
	}
}

func (g *GitManager) isSyncDisabled() bool {
	configPath := filepath.Join(g.dataDir, ".git_config.json")
	if data, err := os.ReadFile(configPath); err == nil {
		var cfg struct {
			Disabled bool `json:"disabled"`
		}
		if err := json.Unmarshal(data, &cfg); err == nil {
			return cfg.Disabled
		}
	}
	return false
}

type SyncLogEntry struct {
	Timestamp      string `json:"timestamp"`
	Action         string `json:"action"`
	Success        bool   `json:"success"`
	Error          string `json:"error"`
	Recommendation string `json:"recommendation"`
}

func (g *GitManager) WriteSyncLog(action string, syncErr error) {
	logPath := filepath.Join(g.dataDir, ".git_sync_log.json")
	var entries []SyncLogEntry

	// Read existing logs if file exists
	if data, err := os.ReadFile(logPath); err == nil {
		json.Unmarshal(data, &entries)
	}

	// Determine recommendation
	rec := ""
	errStr := ""
	if syncErr != nil {
		errStr = syncErr.Error()
		lowerErr := strings.ToLower(errStr)
		if strings.Contains(lowerErr, "auth") || strings.Contains(lowerErr, "authentication") || strings.Contains(lowerErr, "401") || strings.Contains(lowerErr, "credentials") {
			rec = "Authentication failed. Run 'gh auth login --insecure-storage' on the host machine to authenticate."
		} else if strings.Contains(lowerErr, "username") || strings.Contains(lowerErr, "terminal") || strings.Contains(lowerErr, "prompt") {
			rec = "Interactive prompt requested. Make sure you have logged in via 'gh auth login --insecure-storage' on the host."
		} else if strings.Contains(lowerErr, "resolve") || strings.Contains(lowerErr, "dial tcp") || strings.Contains(lowerErr, "timeout") {
			rec = "Network connection failed. Verify the server has internet access and your proxy/DNS settings are correct."
		} else if strings.Contains(lowerErr, "not found") || strings.Contains(lowerErr, "404") {
			rec = "Repository not found. Double check your GITHUB_REPO URL and ensure the repository exists on GitHub."
		} else if strings.Contains(lowerErr, "non-fast-forward") || strings.Contains(lowerErr, "merge") {
			rec = "Conflicts detected. Run a manual git pull/merge on the host to resolve conflicts."
		} else {
			rec = "Check GITHUB_REPO settings and run 'gh auth status' on the host for diagnostics."
		}
	}

	newEntry := SyncLogEntry{
		Timestamp:      time.Now().Format(time.RFC3339),
		Action:         action,
		Success:        syncErr == nil,
		Error:          errStr,
		Recommendation: rec,
	}

	// Prepend new entry and cap at 20 entries
	entries = append([]SyncLogEntry{newEntry}, entries...)
	if len(entries) > 20 {
		entries = entries[:20]
	}

	if data, err := json.MarshalIndent(entries, "", "  "); err == nil {
		os.WriteFile(logPath, data, 0644)
	}
}

// GetSyncLogs retrieves the sync log entries from .git_sync_log.json
func (g *GitManager) GetSyncLogs() []SyncLogEntry {
	logPath := filepath.Join(g.dataDir, ".git_sync_log.json")
	var entries []SyncLogEntry
	if data, err := os.ReadFile(logPath); err == nil {
		json.Unmarshal(data, &entries)
	}
	if entries == nil {
		entries = []SyncLogEntry{}
	}
	return entries
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

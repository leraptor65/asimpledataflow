package models

import "time"

type Note struct {
	ID           int       `json:"id"`
	Filename     string    `json:"filename"`
	Title        string    `json:"title"`
	Frontmatter  string    `json:"frontmatter"` // JSON string
	Content      string    `json:"content"`
	IsPinned     bool      `json:"is_pinned"`
	LastModified time.Time `json:"last_modified"`
	FileType     string    `json:"file_type,omitempty"`
	RawURL       string    `json:"raw_url,omitempty"`
}

type Link struct {
	SourceID int `json:"source_id"`
	TargetID int `json:"target_id"`
}

type SharedLink struct {
	ID        int        `json:"id"`
	Token     string     `json:"token"`
	Filename  string     `json:"filename"`
	ExpiresAt *time.Time `json:"expires_at"` // nil = never expires
	CreatedAt time.Time  `json:"created_at"`
}

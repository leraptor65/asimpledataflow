package models

import "time"

type Note struct {
	ID           int       `json:"id"`
	Filename     string    `json:"filename"`
	Title        string    `json:"title"`
	Frontmatter  string    `json:"frontmatter"` // JSON string
	Content      string    `json:"content"`
	LastModified time.Time `json:"last_modified"`
}

type Link struct {
	SourceID int `json:"source_id"`
	TargetID int `json:"target_id"`
}

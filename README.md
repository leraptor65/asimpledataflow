# A Simple Data Flow (ASDF) — v3.0.0

A high-performance, self-contained Markdown note-taking vault built with a Go backend and a Next.js frontend, delivered as a single Docker container. Features embedded SQLite with FTS5 full-text search, local Git version control, token-based GitHub sync, note pinning, and flexible authentication (web password & reverse proxy forward-auth).

---

## 📖 Table of Contents
1. [What's New in v3.0.0](#-whats-new-in-v300)
2. [Features](#-features)
3. [Quick Start & Deployment](#-quick-start--deployment)
4. [Environment & Configuration](#-environment--configuration)
5. [Authentication & Security](#-authentication--security)
6. [GitHub Sync Integration](#-github-sync-integration-optional)
7. [How-To Guides](#-how-to-guides)
   - [Creating & Organizing Notes](#1-creating--organizing-notes)
   - [Note Pinning](#2-note-pinning)
   - [Bidirectional Wiki Links & Backlinks](#3-bidirectional-wiki-links--backlinks)
   - [Git Version History & Revert](#4-git-version-history--revert)
   - [Public Note Sharing & Expirations](#5-public-note-sharing--expirations)
   - [Workspace Backup & Image Gallery](#6-workspace-backup--image-gallery)
8. [Reverse Proxy & Public Share Routing](#-reverse-proxy--public-share-routing)
9. [Development Setup](#-development-setup)

---

## 🚀 What's New in v3.0.0

- 🗄️ **Embedded SQLite + FTS5 (No Postgres Container)**: Migrated from external PostgreSQL to embedded pure Go SQLite (`modernc.org/sqlite`) with WAL mode and FTS5 triggers. Zero external database containers, lower RAM consumption, and instant zero-config startup.
- 📌 **Note Pinning**: Pin frequently accessed notes to a dedicated "Pinned Notes" section at the top of your sidebar, with quick pin toggles in the editor header and folder tree context menu.
- 🔐 **Web Password Protection (`APP_PASSWORD`)**: Protect your vault with a single environment variable. Features a responsive login screen and secure 30-day session cookies.
- 🛡️ **Forward-Auth Integration (Authentik, Authelia, Cloudflare Access)**: Transparent authentication passthrough via reverse-proxy headers (`X-authentik-username`, `Remote-User`, `X-Forwarded-User`, or custom `AUTH_HEADER`).
- 🔄 **100% Token-Based GitHub Sync**: Removed host `gh` CLI dependencies, `--insecure-storage` keyring flags, and host volume mounts. Sync is now configured purely with standard environment variables (`GITHUB_REPO` and `GITHUB_TOKEN`).
- ⚡ **Next.js App Optimization**: Standalone static asset caching, route rewrites to prevent 404s on browser refreshes, and concurrent Git lock synchronization.

---

## ✨ Features

### 📝 Editor & Markdown
- **Split Pane Layout**: Side-by-side Monaco Editor (left) with styled live Markdown preview (right), full render mode, and mobile responsive layout.
- **GFM & Math**: GitHub Flavored Markdown tables, KaTeX display/inline math, task lists (`- [x]`), syntax-highlighted code blocks with one-click copy.
- **Bidirectional Wiki Links**: Inline links using `[[Note Name]]` that automatically resolve paths and track incoming backlinks.
- **View-Only Sandbox**: Safely preview imported or external notes in memory without adding them to your permanent vault.

### 🗂️ Organization & Search
- **Nested Folder Tree**: Visual sidebar directory tree with auto-directory creation on save, folder collapse/expand, and manual sort modes (A-Z, Z-A, Modified).
- **FTS5 Full-Text Search**: Instant search across titles, filenames, and markdown content powered by SQLite FTS5 index tables.
- **Command Palette (`Ctrl+K`)**: Rapid keyboard-driven search, note creation, and view switching.
- **Recycle Bin**: Soft-delete files with restore capability or permanent deletion.

### 🔄 Version History & Sync
- **Local Git Tracking**: Every save records a Git commit with author attribution and timestamp.
- **Diff & Rollback**: Browse commit history, inspect line-by-line diffs against previous revisions, and revert notes with one click.
- **Automatic Remote Sync**: When configured, automatically pulls remote updates, merges changes, and pushes edits to your private GitHub repo.

---

## 📦 Quick Start & Deployment

ASDF is packaged as a unified multi-stage container running both the Go backend and Next.js frontend.

### 1. Download Docker Compose File
Create a `compose.yml` file:

```yaml
services:
  app:
    image: leraptor65/asimpledataflow:3.0.0
    ports:
      - "3000:3000"
    volumes:
      - ./notes:/app/data
    environment:
      - DATA_DIR=/app/data
      # Optional: Web access password
      # - APP_PASSWORD=your_secure_password
      # Optional: Reverse proxy forward auth header
      # - AUTH_HEADER=X-authentik-username
      # Optional: GitHub cloud sync
      # - GITHUB_REPO=https://github.com/username/my-notes.git
      # - GITHUB_TOKEN=ghp_yourPersonalAccessTokenHere
      # - GIT_AUTHOR_NAME=ASDF Notes
      # - GIT_AUTHOR_EMAIL=notes@asdf.local
    restart: unless-stopped
```

### 2. Launch the Vault
```bash
docker compose up -d
```
Open **`http://localhost:3000`** in your browser.

---

## ⚙️ Environment & Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATA_DIR` | No | `/app/data` | Directory where notes and the `.asdf.db` SQLite database are stored |
| `APP_PASSWORD` | No | _(disabled)_ | Set a password to require authentication before accessing the vault |
| `AUTH_HEADER` | No | _(auto-detect)_ | Custom header to read user identity from (e.g. `X-authentik-username`) |
| `GITHUB_REPO` | No | _(disabled)_ | HTTPS repository URL for cloud synchronization |
| `GITHUB_TOKEN` | No | _(none)_ | Personal Access Token with `repo` scope for private GitHub sync |
| `GIT_AUTHOR_NAME` | No | `ASDF Notes` | Git commit author name |
| `GIT_AUTHOR_EMAIL`| No | `notes@asdf.local` | Git commit author email |
| `PORT` | No | `3000` | Port for the web interface |

---

## 🔐 Authentication & Security

### 1. Web Password Protection
Set `APP_PASSWORD=your_password` in your `compose.yml`. When enabled:
- All API routes (except public share links and health checks) require authentication.
- Users see a clean, centered login prompt.
- Successful login issues an HTTP-only 30-day session cookie (`asdf_session`).
- Users can log out at any time from **Settings → Security & Access Control**.

### 2. Reverse Proxy Forward-Auth (Authentik, Authelia, Cloudflare)
If you deploy ASDF behind an authentication proxy, ASDF automatically checks the following identity headers:
- `X-authentik-username`
- `Remote-User`
- `X-Forwarded-User`
- `X-Auth-Request-User`
- `Tailscale-User-Login`
- Or any header configured in `AUTH_HEADER`

When a valid header is present, access is granted automatically and the authenticated user is displayed in the Settings panel.

---

## 🔄 GitHub Sync Integration (Optional)

Sync your notes vault to a private GitHub repository without installing tools on your host machine:

1. **Generate a GitHub Personal Access Token (PAT)**:
   - Go to GitHub: **Settings → Developer Settings → Personal access tokens → Tokens (classic)**.
   - Select the **`repo`** scope (Full control of private repositories).
   - Copy the token (`ghp_...`).

2. **Configure in `compose.yml`**:
   ```yaml
   environment:
     - GITHUB_REPO=https://github.com/username/my-notes.git
     - GITHUB_TOKEN=ghp_yourTokenHere
     - GIT_AUTHOR_NAME=Your Name
     - GIT_AUTHOR_EMAIL=you@example.com
   ```

3. **Restart the container**:
   ```bash
   docker compose up -d
   ```
   Every note save will automatically commit and push to your remote repository. You can test connection status or trigger a manual push anytime from the **Settings** panel.

---

## 📖 How-To Guides

### 1. Creating & Organizing Notes
- **Create Note**: Click the **`+`** icon in the sidebar or press `Ctrl+K`.
- **Nested Folders**: Click the **New Folder** icon or save a note with a path prefix (e.g. `Tech/Linux/Docker.md`). Parent folders are created automatically.
- **Move / Organize**: Drag and drop items in the sidebar tree or use the **Move To...** context menu option.

### 2. Note Pinning
- **Pin from Editor**: Click the **Pin** icon in the top right editor toolbar.
- **Pin from Sidebar**: Open the three-dot (`...`) context menu on any note in the tree and select **Pin to Top**.
- **Pinned Section**: Pinned notes appear at the very top of your sidebar with count badges and one-click unpin actions.

### 3. Bidirectional Wiki Links & Backlinks
- Type `[[Note Name]]` inside the editor. The preview pane renders a clickable link.
- Clicking a link navigates to the target note (or creates it if it doesn't exist yet).
- Inspect incoming links in the **Backlinks** footer section of the editor.

### 4. Git Version History & Revert
- Open the **History** modal from the editor toolbar.
- Review past commits, view historical snapshots, and compare changes with the built-in diff viewer.
- Click **Revert** to roll back any note to a previous commit.

### 5. Public Note Sharing & Expirations
- Click **Share** in the editor toolbar to generate a secure read-only public URL.
- Set expiration times from `1 Hour` to `Never`.
- Manage, adjust, or revoke active links anytime in **Settings → Shared Links**.

### 6. Workspace Backup & Image Gallery
- **Export / Import**: Download your entire Markdown workspace as a `.zip` archive or upload an existing vault from **Settings → Storage & Maintenance**.
- **Image Gallery**: View and manage all images in `.images/`, copy Markdown tags directly to your clipboard, and drag-and-drop images into notes.

---

## 🛡️ Reverse Proxy & Public Share Routing

If you run ASDF behind an authentication proxy (Authentik, Cloudflare Access, Authelia, or Nginx), exempt the following paths so public share links remain accessible to visitors:

- `/share/*` (Public shared note pages)
- `/api/shared/*` (Backend API serving shared content and images)
- `/_next/static/*` (Frontend bundles and styles)

### Nginx Example
```nginx
server {
    server_name notes.example.com;

    location /share/ {
        proxy_pass http://127.0.0.1:3000;
    }
    location /api/shared/ {
        proxy_pass http://127.0.0.1:3000;
    }
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
    }
    location / {
        # Forward-auth block (Authentik / Authelia)
        auth_request /outpost.goauthentik.io/auth/nginx;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

---

## 🛠️ Development Setup

To run a hot-reloading development environment:

```bash
docker compose -f compose.dev.yml up --build
```
- **Backend API**: `http://localhost:8080` (Go live reload via `air`)
- **Frontend UI**: `http://localhost:3000` (Next.js hot reload)
- **Database**: Pure Go SQLite stored at `./notes/.asdf.db`

---

*Maintained by leraptor65*

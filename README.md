# A Simple Data Flow (ASDF)

A high-performance, locally-first Markdown note-taking app built with a Go backend and a Next.js frontend, deployed via Docker. Features Git-backed version history, PostgreSQL full-text search, bidirectional wiki links, and a split Monaco editor.

---

## 📖 Table of Contents
1. [Features](#-features)
2. [Quick Start & Deployment](#-quick-start--deployment)
3. [Environment & Configuration](#-environment--configuration)
4. [How-To Guides](#-how-to-guides)
   - [Creating & Organizing Notes](#1-creating--organizing-notes)
   - [Bidirectional Wiki Links & Backlinks](#2-bidirectional-wiki-links--backlinks)
   - [Importing Notes & The View-Only Sandbox](#3-importing-notes--the-view-only-sandbox)
   - [Git Version History & Note Reversion](#4-git-version-history--note-reversion)
   - [Public Note Sharing & Expiry](#5-public-note-sharing--expiry)
   - [Orphan Image Scanning & Cleanup](#6-orphan-image-scanning--cleanup)
   - [Vault Export & Import](#7-vault-export--import)
5. [GitHub Sync Integration](#-github-sync-integration-optional)
6. [Bypassing Authentication Proxies for Shares](#-bypassing-authentication-proxies-for-shares)
7. [Development Setup](#-development-setup)

---

## ✨ Features

### 📝 Editor & Writing
- **Split Pane Layout**: Side-by-side view with a resizable Monaco Editor (left) and styled live Markdown preview (right).
- **Full Markdown (GFM)**: Support for GitHub Flavored Markdown tables, KaTeX math rendering, code block syntax highlighting, and line breaks.
- **Wiki Links**: Easy inline links using `[[Note Name]]` which auto-resolves to actual paths and tracks backlinks.
- **View-Only Sandbox**: Secure read-only environment to review external files without importing them into your active vault.
- **Automatic Folder Creation**: Saving a note to a nested path (e.g. `work/projects/report.md`) automatically builds all parent directories.

### 🗂️ Organization & Management
- **Folder Tree**: Visual, nested sidebar tree supporting folder creation and item sorting.
- **Drag-and-Drop / Custom Upload**: Quick import of `.md` files by dragging them onto the app window.
- **PostgreSQL Full-Text Search**: Fast, server-side index search of note content using Postgres `tsvector`.
- **Command Palette**: Accessible via `Ctrl+K` for speedy search, file creation, and navigation.
- **Recycle Bin**: Recover deleted files or permanently remove them from the vault.

### 🔄 History & Cloud Integration
- **Git-Backed**: Every note save triggers a lightweight Git commit under the hood.
- **Version Timeline**: View every commit, preview historical note contents, and revert to previous versions.
- **GitHub Sync**: Bidirectional sync using the host's native `gh auth` session to push/pull updates automatically.

---

## 🚀 Quick Start & Deployment

ASDF is distributed as a multi-stage Docker application. The easiest way to run it is with Docker Compose.

### Quick Launch
1. Clone the repository and navigate to the directory:
   ```bash
   git clone https://github.com/leraptor65/asimpledataflow.git
   cd asimpledataflow
   ```
2. Start the services:
   ```bash
   docker compose up -d
   ```
3. Open your browser and navigate to **`http://localhost:3000`**.

---

## ⚙️ Environment & Configuration

### compose.yml Configuration
```yaml
services:
  app:
    image: leraptor65/asimpledataflow:testing
    ports:
      - "3000:3000"
    volumes:
      - ./notes:/app/data
      # Required for GitHub Sync
      - ~/.config/gh:/root/.config/gh:ro
      - ~/.gitconfig:/root/.gitconfig:ro
    environment:
      - DB_HOST=postgres
      - DB_USER=appuser
      - DB_PASSWORD=your_secure_password # Required — app fails to start without this set
      - DB_NAME=notesdb
      # - DB_SSLMODE=require
      # - CORS_ORIGINS=https://notes.example.com
      # - GITHUB_REPO=https://github.com/username/your-notes-repo.git
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: your_secure_password
      POSTGRES_DB: notesdb
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  pgdata:
```

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_HOST` | No | `localhost` | PostgreSQL host address |
| `DB_USER` | No | `appuser` | PostgreSQL username |
| `DB_PASSWORD` | **Yes** | — | PostgreSQL password (app will crash on startup if empty) |
| `DB_NAME` | No | `notesdb` | PostgreSQL database name |
| `DB_SSLMODE` | No | `disable` | SSL connection mode (`disable`, `require`, `verify-ca`) |
| `CORS_ORIGINS` | No | `*` | Allowed CORS origins (comma-separated list for security) |
| `DATA_DIR` | No | `/app/data` | Workspace directory where Markdown files are stored |
| `GITHUB_REPO` | No | — | Optional remote GitHub repository URL for cloud synchronization |

---

## 📖 How-To Guides

### 1. Creating & Organizing Notes
- **Create a New Note**: Click the **New Note** button at the top of the sidebar. You will be prompted to enter a file name.
- **Nest in Folders**: You can create subfolders using the folder button in the sidebar. To create a note directly in a folder, name it with the path prefix (e.g. `Projects/ASDF.md`), and the directories will be automatically created on save.
- **Move Files/Folders**: Drag-and-drop notes and folders inside the sidebar directory tree to reorganize your vault.
- **Delete Notes**: Click the trash icon next to a note in the sidebar. This moves it to the Recycle Bin. You can restore notes or empty the bin from the Recycle Bin modal.

### 2. Bidirectional Wiki Links & Backlinks
- **Create a Wiki Link**: Type `[[Note Name]]` inside the editor. The preview pane will render this as a clickable link.
- **Navigate Links**: Clicking a wiki link in either the preview pane or the shared page will immediately open that note. If the target note does not exist, a blank one with that title will be created on the fly.
- **Track Backlinks**: Check the **Backlinks** pane in the editor footer to see the list of other notes that reference the current note.

### 3. Importing Notes & The View-Only Sandbox
- **Drag-and-Drop Import**: Drag any `.md` file from your computer and drop it anywhere onto the ASDF web app window. Alternatively, click the **Import File** button in the sidebar.
- **Choose Import Mode**: A modal will prompt you to:
  1. **Save to Vault**: Select a folder destination and filename to store the note permanently.
  2. **Open as View-Only**: Open the note in the **View-Only Sandbox**.
- **View-Only Sandbox Features**: 
  - Opens the file in a read-only editor with a prominent warning banner.
  - Hides the save, share, and editing toolbar buttons.
  - The note content remains entirely in memory and is completely wiped when you close the tab or switch notes.

### 4. Git Version History & Note Reversion
- **Track Commits**: Whenever you save a note, a commit is automatically recorded in the local Git repository under your data directory.
- **View Timeline**: Open the **History** tab in the editor footer. You will see a chronological list of commits containing the author, date, and commit message.
- **Preview Historical Content**: Click any commit hash in the timeline list to load a read-only preview of that historical revision in the editor.
- **Revert Note**: Click the **Revert** button next to a historical commit. This resets the note's state on disk to that version and commits the change.

### 5. Public Note Sharing & Expiry
- **Generate Public Link**: Click the **Share** button in the editor toolbar. This registers a cryptographically secure token.
- **Set Expirations**: Configure links to automatically expire after durations like `1 Hour`, `12 Hours`, `1 Day`, `3 Days`, `1 Week`, `2 Weeks`, `1 Month`, or `Never`.
- **Linked Navigation**: Shared notes allow viewers to navigate into other shared notes if they are linked via wiki links.
- **Management**: Revoke links or adjust expirations at any time via the **Shared Links** section in the **Settings** panel.

### 6. Orphan Image Scanning & Cleanup
- **Upload Images**: Drag-and-drop or paste images directly into the Monaco editor. They are saved to `/app/data/.images/`.
- **Scan & Clean**: Over time, deleted notes may leave behind unused images. Go to **Settings → Storage & Maintenance** and click **Cleanup Images**.
- **Automated Verification**: The system will scan all notes in the database. If an image file in `.images/` is not referenced in any note, it will be listed for batch deletion.

### 7. Vault Export & Import
- **Export Vault**: Go to **Settings → Backup Workspace** and click **Export**. This compiles your entire Markdown vault, including folders and images, into a download file named `vault-export.zip`.
- **Import Vault**: Click **Import** and upload a ZIP archive of Markdown notes. The server parses the file, extracts it securely, avoids directory traversals, and commits the imported files to Git.

---

## 🔄 GitHub Sync Integration (Optional)

ASDF offers built-in automatic sync with a remote GitHub repository. When active, every save pulls remote updates, handles conflict merges, and pushes local changes to GitHub.

Authentication is built around the **GitHub CLI (`gh`)** for simplicity. Instead of pasting personal tokens in docker-compose environment variables, ASDF reads your host machine's `gh` login session using volume mounts.

### Host Machine Setup

1. **Install GitHub CLI (`gh`)**:
   - Ubuntu/Debian: `sudo apt install gh`
   - macOS: `brew install gh`
   - Windows: `winget install GitHub.cli`
2. **Login via Insecure Storage**:
   To allow the Docker container (running as `root` inside the sandbox) to read your login token, you **must** instruct `gh` to store the token in the config file rather than your OS's desktop keyring. Run this command on your host:
   ```bash
   gh auth login --insecure-storage
   ```
   Follow the prompts to authenticate.
3. **Configure Git Author**:
   Ensure Git config has user name and email on the host:
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

### Compose Configuration
Ensure the host mounts `~/.config/gh` and `~/.gitconfig` as read-only. This is already set in the default `compose.yml`:
```yaml
    volumes:
      - ./notes:/app/data
      - ~/.config/gh:/root/.config/gh:ro
      - ~/.gitconfig:/root/.gitconfig:ro
```
Set the `GITHUB_REPO` env var to your private repository URL:
```yaml
    environment:
      - GITHUB_REPO=https://github.com/username/your-notes-repo.git
```

---

## 🛡️ Bypassing Authentication Proxies for Shares

If you run ASDF behind an identity proxy (like Cloudflare Access, Authentik, Authelia, or Nginx basic auth), you must configure bypass routes so public share links function correctly.

Exempt the following routes from authentication:
- `/share/*` (Web frontend pages)
- `/api/shared/*` (Backend API endpoints serving shared note content and images)
- `/_next/static/*` (Static bundle files required to render the shared page)

### Route Configuration Examples

#### Nginx Configuration
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
        # Secure auth proxy block...
        auth_request /outpost.goauthentik.io/auth/nginx;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

#### Cloudflare Access
1. Open the Cloudflare Zero Trust Dashboard → Access → Applications.
2. Edit your ASDF Application.
3. Under policies, create a **Bypass** policy:
   - **Name**: `Public Shares`
   - **Action**: Bypass
   - **Rules**: Path matches:
     - `/share/*`
     - `/api/shared/*`
     - `/_next/static/*`

#### Caddy + Authentik (Forward Auth)
```caddy
notes.example.com {
    @not_shared {
        not path /share/*
        not path /api/shared/*
        not path /_next/static/*
    }
    handle @not_shared {
        # ... forward auth config ...
    }
    handle {
        reverse_proxy http://127.0.0.1:3000
    }
}
```

#### Authelia
```yaml
access_control:
  rules:
    - domain: notes.example.com
      resources:
        - "^/share/.*$"
        - "^/api/shared/.*$"
        - "^/_next/static/.*$"
      policy: bypass
    - domain: notes.example.com
      policy: one_factor
```

---

## 🛠️ Development Setup

To run a hot-reloading development environment locally:

1. Launch dev containers:
   ```bash
   docker compose -f compose.dev.yml up --build
   ```
   - **Go Backend**: `http://localhost:8080` (reloads on Go file changes via `air`)
   - **Next.js Frontend**: `http://localhost:3000` (reloads on React code changes)
2. Create and edit Markdown files under the local `./notes` directory to test file sync watcher.

---

*Open sourced and maintained by leraptor65*

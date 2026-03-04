# A Simple Data Flow (ASDF)

A high-performance, locally-first Markdown note-taking app deployed via Docker. Git-backed version history, PostgreSQL full-text search, and a split Monaco editor — all in a single container.

## Features

### Editor
- **Split Pane Editor** — Monaco Editor on the left, live Markdown preview on the right (resizable)
- **Full Markdown Support** — GFM tables, math (KaTeX), syntax highlighting, line breaks
- **Wiki Links** — `[[Note Name]]` bidirectional linking with backlink tracking
- **Merge Conflict Resolution** — Visual diff editor when a note falls out of sync with disk

### Notes & Organization
- **Folder Tree** — Nested folder structure with drag-and-drop organization
- **Full-Text Search** — PostgreSQL `tsvector` powered search across all notes
- **Backlinks Panel** — See every note that links to the current note
- **Recycle Bin** — Soft-delete with restore capability
- **Command Palette** — `Ctrl+K` quick search and navigation

### Media & Export
- **Image Upload** — Drag-and-drop or paste images, stored in `.images/`
- **Orphan Image Cleanup** — Find and delete images no longer referenced by any note
- **Import / Export Vault** — Bulk ZIP import and export from the Settings panel
- **Print to PDF** — Clean `@media print` layout, suppresses app UI

### Sharing
- **Share Links** — Generate tokenized links to share individual notes publicly
- **Configurable Expiry** — Set links to expire after hours/days or never
- **Linked Note Access** — Wiki-linked notes accessible from shared notes
- **Link Management** — View, update expiry, and revoke share links from Settings

### Version History
- **Git-Backed** — Every save is a `go-git` commit with full history
- **Timeline View** — Browse the commit history of any note
- **Content Preview** — View any historical version of a note
- **Revert** — Restore a note to any previous version

---

## Deployment

### Prerequisites
- Docker and Docker Compose

### Quick Start

```bash
git clone https://github.com/leraptor65/asimpledataflow.git
cd asimpledataflow
docker compose up -d
```

The app will be available at **`http://localhost:3000`**.

### compose.yml

```yaml
services:
  app:
    image: leraptor65/asimpledataflow:testing
    ports:
      - "3000:3000"
    volumes:
      - ./notes:/app/data
    environment:
      - DB_HOST=postgres
      - DB_USER=appuser
      - DB_PASSWORD=changeme        # Required — app will not start without this
      - DB_NAME=notesdb
      # - DB_SSLMODE=require         # Set for production PostgreSQL
      # - CORS_ORIGINS=https://notes.example.com  # Comma-separated allowed origins
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: notesdb
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  pgdata:
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_HOST` | No | `localhost` | PostgreSQL hostname |
| `DB_USER` | No | `appuser` | PostgreSQL username |
| `DB_PASSWORD` | **Yes** | — | PostgreSQL password |
| `DB_NAME` | No | `notesdb` | PostgreSQL database name |
| `DB_SSLMODE` | No | `disable` | PostgreSQL SSL mode (`disable`, `require`, etc.) |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed CORS origins |
| `DATA_DIR` | No | `/app/data` | Path to the notes data directory |
| `PORT` | No | `8080` | Backend API port (internal) |

### Volume Mapping

Notes are stored in `/app/data` inside the container. The default `compose.yml` maps `./notes` on the host to this path, so your `.md` files are directly accessible on disk (e.g., for editing with Obsidian or syncing with Git).

---

## Sharing & Authentication Bypass

ASDF supports **public share links** — tokenized URLs that allow anyone to view a specific note without logging in. If you're running ASDF behind an authentication proxy (Authentik, Authelia, Cloudflare Access, etc.), you'll need to exempt the share paths from authentication.

### Paths That Must Bypass Authentication

| Path | Purpose |
|------|---------|
| `/share/*` | Frontend shared note pages |
| `/api/shared/*` | Backend API for shared notes, linked notes, and images |

### Caddy + Authentik (Forward Auth)

```
asdf.example.com {
    # include this block in your caddyfile
    @not_shared {
        not path /share/*
        not path /api/shared/*
        not path /_next/static/*
    }
    handle @not_shared {
        # ... authentik config ...
    }

    # ...rest of your caddyfile...
}
```

### Nginx + Authentik (Forward Auth)

```nginx
server {
    server_name asdf.example.com;

    # Bypass auth for shared note paths
    location /share/ {
        proxy_pass http://127.0.0.1:3000;
    }
    location /api/shared/ {
        proxy_pass http://127.0.0.1:3000;
    }
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
    }

    # Everything else goes through Authentik
    location / {
        auth_request /outpost.goauthentik.io/auth/nginx;
        # ... authentik config ...
        proxy_pass http://127.0.0.1:3000;
    }
}
```

### Cloudflare Access (Zero Trust)

1. Go to **Zero Trust Dashboard → Access → Applications**
2. Select your ASDF application
3. Add a **Bypass** policy:
   - **Policy name**: `Allow Shared Notes`
   - **Action**: Bypass
   - **Selector**: Path
   - Starts with `/share/`
   - Starts with `/api/shared/`
   - Starts with `/_next/static/`

### Authelia

```yaml
access_control:
  rules:
    # Bypass auth for shared notes
    - domain: asdf.example.com
      resources:
        - "^/share/.*$"
        - "^/api/shared/.*$"
        - "^/_next/static/.*$"
      policy: bypass

    # Require auth for everything else
    - domain: asdf.example.com
      policy: one_factor
```

### How It Works

When a share link is generated, ASDF creates a cryptographically random token stored in PostgreSQL. The share endpoints validate the token and its expiry on every request. Images embedded in shared notes are served through a dedicated endpoint (`/api/shared/{token}/images/*`) that verifies the image is actually referenced in the note's content before serving it — so the `.images/` directory is never exposed beyond what's in the shared note.

---

## Development

```bash
# Start with hot-reload
docker compose -f compose.dev.yml up --build

# Backend: http://localhost:8080
# Frontend: http://localhost:3000
```

---

*Open sourced and maintained by leraptor65*

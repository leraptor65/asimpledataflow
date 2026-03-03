# A Simple Data Flow (ASDF)

**A Simple Data Flow** is a high-performance, locally-first Markdown note-taking environment deployed via Docker. It elegantly ties a Git-backed filesystem architecture together with a lightning-fast PostgreSQL metadata search block.

![A Simple Data Flow Interface](https://via.placeholder.com/800x450?text=ASDF+Split+Editor+Preview)

## Core Features

- **Split Editor Engine**: Effortlessly write purely in Markdown with Monaco Editor bindings, previewing live renders powered by `remark-gfm` inside an integrated resizable split-pane.
- **Git Version History**: Behind the scenes, the Go API manages every single note edit utilizing a structured internal `go-git` history commit graph, giving you a detailed timeline view of every file.
- **Merge Conflict Resolution**: If a note draft falls out of sync with its local disk file via external modifications, ASDF gracefully locks the UI, exposing a 2-way Visual Interactive Diff Editor so you can natively splice line changes.
- **Native Print-to-PDF**: Render your syntax with precise, responsive `@media print` layout scaling that dynamically suppresses application UI to ensure strictly typed 12/10/9pt A4 print distributions directly from your browser engine.
- **Complete Portability**: Bulk "Import Vault" and "Export Vault" functions compress and unpack everything safely into the core runtime volumes via the settings panel.

## Quick Start (Docker)

Deploying ASDF onto any server is fully standardized through `docker-compose`.

```bash
# 1. Clone the repository
git clone https://github.com/leraptor65/asimpledataflow.git
cd asimpledataflow

# 2. Spin up the instances in detached mode
docker compose up -d
```

### Accessing the Web UI
The application will automatically build the Go binary and Next.js frontend distributions. Once the containers stabilize, you can access the dashboard locally at:
**`http://localhost:3000`**

### Volume Management
By default, the `compose.yml` mounts an internal named persistent Docker volume (`asdf-data:/app/data`) for notes and properties. If you wish to mount your notes locally to the absolute path of the host system (e.g., exposing the `.md` files to external tools like Obsidian), map it manually:

```yaml
# In compose.yml -> backend -> volumes
    volumes:
      - ./my-absolute-local-notes-dir:/app/data
```

---

*Open Sourced and maintained by leraptor65*

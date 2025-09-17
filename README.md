# A Simple Data Flow

A simple, self-hosted, and containerized markdown viewer, editor, and organizer.

## Core Principles

  * **Data Portability**: All your documents are stored as plain markdown files on a local volume. This means you own your data completely and can access, back up, and migrate your notes without vendor lock-in.
  * **Simple & Focused**: The application is designed to do one thing well: manage your markdown files.
  * **Easy to Host**: Thanks to Docker, deploying "A Simple Data Flow" is a single-command process.

## Features

  * **File-based storage**: Your notes are simple `.md` files in a folder structure.
  * **Live Markdown Editor**: Create and edit documents with a live preview.
  * **REST API**: A lightweight Go backend to manage files.
  * **Dark Mode**: Switch between light and dark themes for your comfort.
  * **File and Folder Search**: Quickly find the notes and folders you're looking for.
  * **Import and Export**:
      * Import notes from `.md` or `.zip` files.
      * Export a single note, a folder as a `.zip` file, or all of your notes as a single `.zip` file.
  * **Recycle Bin**:
      * Move notes and folders to a recycle bin instead of permanently deleting them.
      * Restore items from the recycle bin.
      * Permanently delete items from the recycle bin.
  * **Image Uploads**: Upload and embed images directly into your markdown notes.
  * **File and Folder Management**:
      * Create, rename, move, and delete files and folders.
      * Use the context menu (right-click) for quick access to file and folder operations.
  * **Expand and Collapse All Folders**: Easily navigate your folder structure.

## Getting Started

The easiest way to run "A Simple Data Flow" is with Docker Compose.

**Prerequisites:**

  * [Docker](https://www.docker.com/get-started) and [Docker Compose](https://docs.docker.com/compose/install/) installed on your system.

**Instructions:**

1.  **Create a directory** for your project and navigate into it. This will be the location where your documents are stored.

    ```bash
    mkdir my-documents
    cd my-documents
    ```

2.  **Download the `compose.yml` file:**

    ```bash
    wget https://raw.githubusercontent.com/leraptor65/asimpledataflow/main/compose.yml
    ```

    *If you don't have `wget`, you can simply copy the contents from the repository page and save it as `compose.yml`.*

3.  **Run the application:**

    ```bash
    docker compose up -d
    ```

    This command will automatically download the `leraptor65/asimpledataflow` image from Docker Hub and start the container. The `./data` directory will be created automatically, and your markdown files will be stored there.

4.  **Access the web interface:**
    Open your browser and go to `http://localhost:8000`.

## Development

If you'd like to contribute, you can run the application in a development environment with hot-reloading.

**Instructions:**

1.  Clone the repository:
    ```bash
    git clone https://github.com/leraptor65/asimpledataflow.git
    cd asimpledataflow
    ```
2.  Run the development Docker Compose file:
    ```bash
    docker compose -f docker-compose.dev.yml up --build
    ```
3.  Access the app at `http://localhost:3000`.

## Contributing

We welcome contributions\! Feel free to open issues or submit pull requests on the [GitHub repository](https://github.com/leraptor65/asimpledataflow).
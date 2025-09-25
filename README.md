# A Simple Data Flow

A simple, self-hosted, and containerized markdown viewer, editor, and organizer.

## Core Principles

-   **Data Portability**: All your documents are stored as plain markdown files on a local volume. This means you own your data completely and can access, back up, and migrate your notes without vendor lock-in.
-   **Simple & Focused**: The application is designed to do one thing well: manage your markdown files in a clean and intuitive interface.
-   **Easy to Host**: Thanks to Docker, deploying "A Simple Data Flow" is a single-command process.

## Features

### Core Features

-   **File-Based Storage**: Your notes are simple `.md` files in a folder structure you control.
-   **Live Markdown Editor**: A powerful editor with live preview, a full toolbar, and direct image upload support.
-   **File & Folder Management**: Easily create, rename, move, and delete files and folders through an intuitive, collapsible sidebar.
-   **Search**: Quickly find any note or folder with a responsive search bar.
-   **Navigation**: Clickable breadcrumbs in the main view allow for easy navigation through your folder hierarchy.

### Data Management

-   **Import**: Import single `.md` files or `.zip` archives of your notes.
-   **Export**: Export individual notes, entire folders, or your complete collection as a single `.zip` file.
-   **Recycle Bin**: Safely delete items and restore them later, or choose to delete them permanently. You can also empty the entire bin with a single click.
-   **Data Integrity Check**: Automatically scan for and resolve case-sensitive naming conflicts (e.g., `File.md` and `file.md` in the same folder) to prevent data loss.
-   **Image Management**: View all uploaded images in the settings panel and delete those that are no longer needed to free up space.

### User Experience

-   **Dark Mode**: A sleek dark mode for comfortable viewing in low-light conditions.
-   **Collapsible Sidebar**: Adjust your workspace by collapsing the sidebar for a more focused writing environment.
-   **Activity Log**: Keep track of all major actions, such as file renames, data integrity fixes, and log clearing.

## Getting Started

The easiest way to run "A Simple Data Flow" is with Docker Compose.

**Prerequisites:**

-   [Docker](https://www.docker.com/get-started) and [Docker Compose](https://docs.docker.com/compose/install/) installed on your system.

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

## Acknowledgements

This project was built with the help of some fantastic open-source libraries:

-   **[Ant Design](https://ant.design/)**: For the comprehensive and beautiful UI component library.
-   **[@uiw/react-md-editor](https://uiwjs.github.io/react-md-editor/)**: For the excellent Markdown editor component.

## Contributing

We welcome contributions! Feel free to open issues or submit pull requests on the [GitHub repository](https://github.com/leraptor65/asimpledataflow).
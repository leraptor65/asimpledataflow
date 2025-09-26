const API_URL = '/api';

// Helper to encode paths for URL
const encodeURLPath = (path) => {
    if (!path) return '';
    return path.split('/').map(segment => encodeURIComponent(segment.replace(/ /g, '_'))).join('/');
};


export const fetchDocuments = async () => {
    const response = await fetch(`${API_URL}/documents`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};

export const fetchDocumentContent = async (id) => {
    const response = await fetch(`${API_URL}/documents/${encodeURLPath(id)}`);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
    return response;
};

export const saveDocument = async (id, content) => {
    const response = await fetch(`${API_URL}/documents/${encodeURLPath(id)}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'text/markdown',
        },
        body: content,
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
};

export const createNote = async (path, content) => {
    const response = await fetch(`${API_URL}/documents/${encodeURLPath(path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body: content,
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
};

export const renameItem = async (oldPath, newPath) => {
    const response = await fetch(`${API_URL}/documents/${encodeURLPath(oldPath)}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPath: newPath }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
};

export const deleteItem = async (path) => {
    const response = await fetch(`${API_URL}/documents/${encodeURLPath(path)}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
};

export const createFolder = async (path) => {
    const response = await fetch(`${API_URL}/folders/${encodeURLPath(path)}`, {
        method: 'POST',
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
};

export const importFile = async (formData) => {
    const response = await fetch(`${API_URL}/import`, {
        method: 'POST',
        body: formData,
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
};

export const uploadImage = async (formData) => {
    const response = await fetch(`${API_URL}/images`, {
        method: 'POST',
        body: formData,
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
    return response.json();
};

export const fetchImages = async () => {
    const response = await fetch(`${API_URL}/images`);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
    return response.json();
};

export const deleteImage = async (name) => {
    const response = await fetch(`${API_URL}/images/${name}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
};


export const fetchTrash = async () => {
    const response = await fetch(`${API_URL}/trash`);
    if (!response.ok) {
        throw new Error('Could not fetch trash items');
    }
    return response.json();
}

export const restoreItemFromTrash = async (id) => {
    const response = await fetch(`${API_URL}/trash/restore/${encodeURLPath(id)}`, { method: 'PUT' });
    if (!response.ok) {
        throw new Error('Could not restore item');
    }
}

export const deleteItemPermanently = async (id) => {
    const response = await fetch(`${API_URL}/trash/delete/${encodeURLPath(id)}`, { method: 'DELETE' });
    if (!response.ok) {
        throw new Error('Could not delete item permanently');
    }
}

export const emptyTrash = async () => {
    const response = await fetch(`${API_URL}/trash/empty`, { method: 'DELETE' });
    if (!response.ok) {
        throw new Error('Could not empty trash');
    }
}

export const resolveNameConflicts = async () => {
    const response = await fetch(`${API_URL}/settings/resolve-conflicts`, {
        method: 'POST',
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
    return response.json();
};

export const fetchLogs = async () => {
    const response = await fetch(`${API_URL}/logs`);
    if (!response.ok) {
        throw new Error('Could not fetch logs');
    }
    return response.text();
};

export const clearLogs = async () => {
    const response = await fetch(`${API_URL}/logs`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
};


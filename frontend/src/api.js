const API_URL = '/api';

export const fetchDocuments = async () => {
    const response = await fetch(`${API_URL}/documents`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};

export const fetchDocumentContent = async (id) => {
    const response = await fetch(`${API_URL}/documents/${id}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
};

export const saveDocument = async (id, content) => {
    const response = await fetch(`${API_URL}/documents/${id}`, {
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
    const response = await fetch(`${API_URL}/documents/${path}`, {
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
    const response = await fetch(`${API_URL}/documents/${oldPath}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPath }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
};

export const deleteItem = async (path) => {
    const response = await fetch(`${API_URL}/documents/${path}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
};

export const createFolder = async (path) => {
    const response = await fetch(`${API_URL}/folders/${path}`, {
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

export const listImages = async () => {
    const response = await fetch(`${API_URL}/images/list`);
    if (!response.ok) {
        throw new Error('Could not fetch images');
    }
    return response.json();
}

export const deleteImage = async (filename) => {
    const response = await fetch(`${API_URL}/images/delete/${filename}`, { method: 'DELETE' });
    if (!response.ok) {
        throw new Error('Could not delete image');
    }
}

export const fetchTrash = async () => {
    const response = await fetch(`${API_URL}/trash`);
    if (!response.ok) {
        throw new Error('Could not fetch trash items');
    }
    return response.json();
}

export const restoreItemFromTrash = async (id) => {
    const response = await fetch(`${API_URL}/trash/restore/${id}`, { method: 'PUT' });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
}

export const deleteItemPermanently = async (id) => {
    const response = await fetch(`${API_URL}/trash/delete/${id}`, { method: 'DELETE' });
    if (!response.ok) {
        throw new Error('Could not delete item permanently');
    }
}

export const emptyTrash = async () => {
    const response = await fetch(`${API_URL}/trash/empty`, { method: 'DELETE' });
    if (!response.ok) {
        throw new Error('Could not empty recycle bin');
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

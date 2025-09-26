import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { notification } from 'antd';
import * as api from '../api';

// Helper functions for URL-friendly paths
const encodePath = (path) => path.replace(/ /g, '_');
const decodePath = (path) => path.replace(/_/g, ' ');

const useNotes = () => {
    const [documents, setDocuments] = useState([]);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [markdown, setMarkdown] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isResolving, setIsResolving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [view, setView] = useState('welcome');
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [trashedItems, setTrashedItems] = useState([]);
    const [fileContent, setFileContent] = useState(null);

    const [conflictResults, setConflictResults] = useState(null);
    const [activityLogs, setActivityLogs] = useState('');
    const [images, setImages] = useState([]);

    const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
    const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
    const [isNewFolderModalVisible, setIsNewFolderModalVisible] = useState(false);
    const [isNewNoteModalVisible, setIsNewNoteModalVisible] = useState(false);
    const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);

    const [itemToRename, setItemToRename] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [folderToCreateIn, setFolderToCreateIn] = useState('');
    const [newFolderName, setNewFolderName] = useState('');
    const [newNoteName, setNewNoteName] = useState('');
    const [currentFolder, setCurrentFolder] = useState('');
    const [itemToMove, setItemToMove] = useState(null);
    const [destinationFolder, setDestinationFolder] = useState('');
    const [expandedKeys, setExpandedKeys] = useState([]);

    const fileInputRef = useRef();

    const fetchDocs = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await api.fetchDocuments();
            setDocuments(data);
        } catch (e) {
            notification.error({
                message: "Error fetching documents",
                description: e.message,
                placement: 'top',
            });
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchLogs = useCallback(async () => {
        try {
            const logs = await api.fetchLogs();
            setActivityLogs(logs);
        } catch (e) {
            notification.error({
                message: "Error fetching logs",
                description: e.message,
                placement: 'top',
            });
        }
    }, []);

    const fetchImages = useCallback(async () => {
        try {
            const imageList = await api.fetchImages();
            setImages(imageList);
        } catch (e) {
            notification.error({
                message: "Could not fetch images",
                description: e.message,
                placement: 'top',
            });
        }
    }, []);

    const handleClearLogs = async () => {
        try {
            await api.clearLogs();
            notification.success({ message: "Activity log cleared.", placement: 'top' });
            fetchLogs();
        } catch (e) {
            notification.error({
                message: "Error clearing logs",
                description: e.message,
                placement: 'top',
            });
        }
    };

    const handleDeleteImage = async (name) => {
        try {
            await api.deleteImage(name);
            notification.success({ message: "Image deleted.", placement: 'top' });
            fetchImages();
        } catch (e) {
            notification.error({
                message: "Error deleting image",
                description: e.message,
                placement: 'top',
            });
        }
    };

    const findItemByPath = useCallback((path, items) => {
        for (const item of items) {
            if (item.path === path) {
                return item;
            }
            if (item.children) {
                const found = findItemByPath(path, item.children);
                if (found) return found;
            }
        }
        return null;
    }, []);

    const processPath = useCallback((path) => {
        if (path === '/settings') {
            setView('settings');
            setSelectedDoc(null);
            setSelectedFolder(null);
        } else if (path === '/trash') {
            getTrash();
        } else if (path.startsWith('/data/')) {
            const docId = decodePath(path.substring(6));
            const item = findItemByPath(docId, documents);
            if (item) {
                if (item.type === 'folder') {
                    setSelectedFolder(item);
                    setView('folder');
                    setSelectedDoc(null);
                } else {
                    fetchDocContent(docId, false);
                }
            } else {
                 // It might be a file that exists but the tree isn't fully expanded/loaded
                 // Or it could be a folder. Let fetchDocContent handle it.
                 // The backend will return an error for a folder, which we'll handle.
                fetchDocContent(docId, false);
            }
        } else {
            setView('welcome');
            setSelectedDoc(null);
            setSelectedFolder(null);
        }
    }, [documents, findItemByPath]); // eslint-disable-line react-hooks/exhaustive-deps
    
    // Initial data fetch
    useEffect(() => {
        fetchDocs();
        fetchLogs();
    }, [fetchDocs, fetchLogs]);

    // Handle routing based on URL
    useEffect(() => {
        const handleLocationChange = () => {
            processPath(window.location.pathname);
        };

        window.addEventListener('popstate', handleLocationChange);
        handleLocationChange(); // Process initial path

        return () => {
            window.removeEventListener('popstate', handleLocationChange);
        };
    }, [processPath]);

    const fetchDocContent = async (id, pushState = true) => {
        if (!id) return;
        try {
            setMarkdown('');
            setFileContent(null);
            setIsLoading(true);

            const response = await api.fetchDocumentContent(id);

            if (pushState) {
                const newUrl = `/data/${encodePath(id)}`;
                window.history.pushState({ id }, '', newUrl);
            }

            const contentType = response.headers.get('Content-Type');
            setSelectedDoc(id);
            setSelectedFolder(null);

            if (contentType.startsWith('image/')) {
                const blob = await response.blob();
                setFileContent(URL.createObjectURL(blob));
                setView('image');
            } else if (contentType === 'text/markdown') {
                const content = await response.text();
                setMarkdown(content);
                setView('document');
            } else {
                const content = await response.text();
                setFileContent(content);
                setView('text');
            }
        } catch (e) {
            // Check if it's the specific "path is a directory" error from our backend
            if (e.message && e.message.includes('path is a directory')) {
                const item = findItemByPath(id, documents);
                if(item && item.type === 'folder') {
                    setSelectedFolder(item);
                    setView('folder');
                    setSelectedDoc(null);
                }
            } else {
                notification.error({
                    message: "Error fetching content",
                    description: e.message,
                    placement: 'top',
                });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const saveDoc = async () => {
        if (!selectedDoc) return;
        try {
            await api.saveDocument(selectedDoc, markdown);
            notification.success({
                message: "Document saved.",
                placement: 'top',
            });
            fetchDocs();
        } catch (e) {
            notification.error({
                message: "Error saving document",
                description: e.message,
                placement: 'top',
            });
        }
    };

    const createNote = async () => {
        if (!newNoteName) {
            notification.warning({ message: "Note name cannot be empty.", placement: 'top' });
            return;
        }
        const finalPath = currentFolder ? `${currentFolder}/${newNoteName}` : newNoteName;
        try {
            await api.createNote(finalPath, '# New Document\n\nWrite your content here.');
            setNewNoteName('');
            setIsNewNoteModalVisible(false);
            await fetchDocs();
            navigate(`/data/${encodePath(finalPath)}`);
            notification.success({
                message: "Note created.",
                placement: 'top',
            });
        } catch (e) {
            notification.error({
                message: "Error creating note",
                description: e.message,
                placement: 'top',
            });
        }
    };

    const navigate = (path) => {
        window.history.pushState(null, '', path);
        processPath(path);
    };

    const renameItem = async () => {
        if (!itemToRename || !newNoteName) return;

        const oldPathParts = itemToRename.path.split('/');
        oldPathParts.pop(); // Remove old name
        const parentPath = oldPathParts.join('/');
        const newPath = parentPath ? `${parentPath}/${newNoteName}` : newNoteName;

        try {
            await api.renameItem(itemToRename.path, newPath);
            setIsRenameModalVisible(false);
            await fetchDocs();
            notification.success({ message: `${itemToRename.name} renamed.`, placement: 'top' });
            if (selectedDoc === itemToRename.path) {
                const newUrl = `/data/${encodePath(newPath)}`;
                window.history.replaceState({ id: newPath }, '', newUrl);
                setSelectedDoc(newPath);
            }
        } catch (e) {
            notification.error({ message: "Error renaming item", description: e.message, placement: 'top' });
        }
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            await api.deleteItem(itemToDelete.path);
            setIsDeleteModalVisible(false);
            fetchDocs();
            if (selectedDoc === itemToDelete.path) {
                navigate('/');
            }
            notification.success({ message: `${itemToDelete.name} moved to recycle bin.`, placement: 'top' });
        } catch (e) {
            notification.error({ message: "Error deleting item", description: e.message, placement: 'top' });
        }
    };

    const createFolder = async () => {
        if (!newFolderName) {
            notification.warning({ message: "Folder name cannot be empty.", placement: 'top' });
            return;
        }
        const fullPath = folderToCreateIn ? `${folderToCreateIn}/${newFolderName}` : newFolderName;
        try {
            await api.createFolder(fullPath);
            setIsNewFolderModalVisible(false);
            fetchDocs();
            notification.success({ message: "Folder created.", placement: 'top' });
        } catch (e) {
            notification.error({ message: "Error creating folder", description: e.message, placement: 'top' });
        }
    };

    const moveItem = async () => {
        if (!itemToMove) return;

        const destinationPath = destinationFolder === '' ? '' : destinationFolder;
        const currentDirectory = itemToMove.path.substring(0, itemToMove.path.lastIndexOf('/'));

        if (destinationPath === currentDirectory) {
            notification.error({
                message: "Cannot move item to its current location.",
                placement: 'top',
            });
            setIsMoveModalVisible(false);
            return;
        }

        const newPath = destinationFolder ? `${destinationFolder}/${itemToMove.name}` : itemToMove.name;

        try {
            await api.renameItem(itemToMove.path, newPath)
            setIsMoveModalVisible(false);
            await fetchDocs();
            notification.success({
                message: `${itemToMove.name} moved.`,
                placement: 'top',
            });
            if (selectedDoc === itemToMove.path) {
                const newUrl = `/data/${encodePath(newPath)}`;
                window.history.replaceState({ id: newPath }, '', newUrl);
                setSelectedDoc(newPath);
            }
        } catch (e) {
            notification.error({
                message: "Error moving item",
                description: e.message,
                placement: 'top',
            });
        }
    };

    const importFile = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            await api.importFile(formData);
            notification.success({
                message: "Import successful.",
                placement: 'top',
            });
            fetchDocs();
        } catch (e) {
            notification.error({
                message: "Import failed.",
                description: e.message,
                placement: 'top',
            });
        }
    };

    const exportAll = async () => {
        try {
            const response = await fetch(`/api/export/`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'export.zip';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            notification.error({
                message: "Error exporting documents",
                description: e.message,
                placement: 'top',
            });
        }
    };

    const getTrash = async () => {
        try {
            const data = await api.fetchTrash();
            setTrashedItems(data || []);
            setView('trash');
            setSelectedDoc(null);
            setSelectedFolder(null);
        } catch (e) {
            notification.error({ message: "Error", description: e.message, placement: 'top' });
        }
    };

    const restoreItem = async (id) => {
        try {
            await api.restoreItemFromTrash(id);
            notification.success({ message: "Item restored", placement: 'top' });
            getTrash();
            fetchDocs();
        } catch (e) {
            notification.error({ message: "Error", description: e.message, placement: 'top' });
        }
    };

    const deletePermanently = async (id) => {
        try {
            await api.deleteItemPermanently(id);
            notification.success({ message: "Item permanently deleted", placement: 'top' });
            getTrash();
        } catch (e) {
            notification.error({ message: "Error", description: e.message, placement: 'top' });
        }
    };

    const emptyTrash = async () => {
        try {
            await api.emptyTrash();
            notification.success({ message: "Recycle bin emptied.", placement: 'top' });
            getTrash();
        } catch (e) {
            notification.error({
                message: "Error emptying recycle bin",
                description: e.message,
                placement: 'top',
            });
        }
    }

    const handleResolveConflicts = async () => {
        setIsResolving(true);
        setConflictResults(null);
        try {
            const operations = await api.resolveNameConflicts();
            setConflictResults(operations || []);
            if (operations && operations.length > 0) {
                notification.success({
                    message: "Data integrity check complete",
                    description: "Naming conflicts have been resolved.",
                    duration: 5,
                    placement: 'top',
                });
            } else {
                notification.success({
                    message: "Data integrity check complete",
                    description: "No naming conflicts found.",
                    placement: 'top',
                });
            }
            fetchDocs();
            fetchLogs();
        } catch (e) {
            notification.error({
                message: "Error checking data integrity",
                description: e.message,
                placement: 'top',
            });
        } finally {
            setIsResolving(false);
        }
    };

    const filteredDocuments = useMemo(() => {
        if (!searchQuery) {
            return documents;
        }

        const lowercasedQuery = searchQuery.toLowerCase();

        const filterItems = (items) => {
            return items.reduce((acc, item) => {
                if (item.type === 'folder') {
                    const filteredChildren = filterItems(item.children || []);
                    if (filteredChildren.length > 0 || item.name.toLowerCase().includes(lowercasedQuery)) {
                        acc.push({ ...item, children: filteredChildren });
                    }
                } else { // type is 'file'
                    if (item.name.toLowerCase().includes(lowercasedQuery)) {
                        acc.push(item);
                    }
                }
                return acc;
            }, []);
        };

        return filterItems(documents);
    }, [documents, searchQuery]);

    return {
        documents,
        selectedDoc,
        setSelectedDoc,
        markdown,
        setMarkdown,
        isLoading,
        isResolving,
        searchQuery,
        setSearchQuery,
        filteredDocuments,
        view,
        setView,
        selectedFolder,
        setSelectedFolder,
        trashedItems,
        fileContent,
        isRenameModalVisible,
        setIsRenameModalVisible,
        isDeleteModalVisible,
        setIsDeleteModalVisible,
        isNewFolderModalVisible,
        setIsNewFolderModalVisible,
        isNewNoteModalVisible,
        setIsNewNoteModalVisible,
        isMoveModalVisible,
        setIsMoveModalVisible,
        itemToRename,
        setItemToRename,
        itemToDelete,
        setItemToDelete,
        folderToCreateIn,
        setFolderToCreateIn,
        newFolderName,
        setNewFolderName,
        newNoteName,
        setNewNoteName,
        currentFolder,
        setCurrentFolder,
        itemToMove,
        setItemToMove,
        destinationFolder,
        setDestinationFolder,
        expandedKeys,
        setExpandedKeys,
        fileInputRef,
        saveDoc,
        createNote,
        renameItem,
        confirmDelete,
        createFolder,
        moveItem,
        importFile,
        exportAll,
        restoreItem,
        deletePermanently,
        handleResolveConflicts,
        conflictResults,
        setConflictResults,
        activityLogs,
        fetchLogs,
        handleClearLogs,
        images,
        fetchImages,
        handleDeleteImage,
        emptyTrash,
        encodePath,
        navigate,
    };
};

export default useNotes;


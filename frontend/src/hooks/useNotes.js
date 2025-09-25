import { useState, useEffect, useMemo, useRef } from 'react';
import { message, Modal } from 'antd';
import * as api from '../api';

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
    const [images, setImages] = useState([]);

    const [conflictResults, setConflictResults] = useState(null);
    const [activityLogs, setActivityLogs] = useState('');


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


    const fetchDocs = async () => {
        try {
            const data = await api.fetchDocuments();
            setDocuments(data);
        } catch (e) {
            message.error(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const navigateToPath = (path) => {
        if (path === '') {
            setView('welcome');
            setSelectedDoc(null);
            setSelectedFolder(null);
            window.history.pushState(null, '', '/');
            return;
        }
    
        // A helper function to find an item (file or folder) in the documents tree
        const findItem = (items, targetPath) => {
            for (const item of items) {
                if (item.path === targetPath) {
                    return item;
                }
                if (item.children) {
                    const found = findItem(item.children, targetPath);
                    if (found) return found;
                }
            }
            return null;
        };
    
        const item = findItem(documents, path);
    
        if (item) {
            if (item.type === 'folder') {
                setSelectedFolder(item);
                setView('folder');
                setSelectedDoc(null);
                window.history.pushState({ id: path }, '', `/${path}`);
            } else {
                fetchDocContent(path, true);
            }
        } else {
            // If not found, it might be a file path that lost its extension in the tree data.
            // fetchDocContent is robust enough to try adding extensions.
            fetchDocContent(path, true);
        }
    };

    const fetchLogs = async () => {
        try {
            const logs = await api.fetchLogs();
            setActivityLogs(logs);
        } catch (e) {
            message.error(e.message);
        }
    };

    const handleClearLogs = async () => {
        try {
            await api.clearLogs();
            message.success("Activity log cleared.");
            fetchLogs(); // Refresh logs to show it's empty
        } catch(e) {
            message.error(e.message);
        }
    };

    const fetchImages = async () => {
        try {
            const imageList = await api.listImages();
            setImages(imageList);
        } catch (e) {
            message.error(e.message);
        }
    };

    const handleDeleteImage = (filename) => {
        Modal.confirm({
            title: 'Delete Image?',
            content: `Are you sure you want to permanently delete "${filename}"? This action cannot be undone.`,
            okText: 'Delete',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await api.deleteImage(filename);
                    message.success(`Image "${filename}" deleted.`);
                    fetchImages();
                } catch (e) {
                    message.error(e.message);
                }
            },
        });
    };

    useEffect(() => {
        fetchDocs();
        fetchLogs();
    }, []);

    const fetchDocContent = async (id, pushState = true) => {
        if (!id) return;
        try {
            // Reset state to avoid showing stale content
            setMarkdown('');
            setFileContent(null);
            setIsLoading(true);

            const response = await api.fetchDocumentContent(id);

            if (pushState) {
                window.history.pushState({ id }, '', `/${id}`);
            }

            const contentType = response.headers.get('Content-Type');
            setSelectedDoc(id);

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
            message.error(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const saveDoc = async () => {
        if (!selectedDoc) return;
        try {
            await api.saveDocument(selectedDoc, markdown); // markdown state is updated by Lexical's OnChangePlugin
            message.success("Document saved.");
            fetchDocs();
        } catch (e) {
            message.error(e.message);
        }
    };

    const createNote = async () => {
        if (!newNoteName) {
            message.warning("Note name cannot be empty.");
            return;
        }
        const finalPath = currentFolder ? `${currentFolder}/${newNoteName}` : newNoteName;
        try {
            await api.createNote(finalPath, '# New Document\n\nWrite your content here.');
            setNewNoteName('');
            setIsNewNoteModalVisible(false);
            fetchDocs();
            fetchDocContent(finalPath);
            message.success("Note created.");
        } catch (e) {
            message.error(e.message);
        }
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
            fetchDocs();
            message.success(`${itemToRename.name} renamed.`);
        } catch (e) {
            message.error(e.message);
        }
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            await api.deleteItem(itemToDelete.path);
            setIsDeleteModalVisible(false);
            fetchDocs();
            if (selectedDoc === itemToDelete.path) {
                setView('welcome');
                setSelectedDoc(null);
            }
            message.success(`${itemToDelete.name} moved to recycle bin.`);
        } catch (e) {
            message.error(e.message);
        }
    };

    const createFolder = async () => {
        if (!newFolderName) {
            message.warning("Folder name cannot be empty.");
            return;
        }
        const fullPath = folderToCreateIn ? `${folderToCreateIn}/${newFolderName}` : newFolderName;
        try {
            await api.createFolder(fullPath);
            setIsNewFolderModalVisible(false);
            fetchDocs();
            message.success("Folder created.");
        } catch (e) {
            message.error(e.message);
        }
    };

    const moveItem = async () => {
        if (!itemToMove) return;

        const destinationPath = destinationFolder === '' ? '' : destinationFolder;
        const currentDirectory = itemToMove.path.substring(0, itemToMove.path.lastIndexOf('/'));

        if (destinationPath === currentDirectory) {
            message.error("Cannot move item to its current location.");
            setIsMoveModalVisible(false);
            return;
        }

        const newPath = destinationFolder ? `${destinationFolder}/${itemToMove.name}` : itemToMove.name;

        try {
            await api.renameItem(itemToMove.path, newPath)
            setIsMoveModalVisible(false);
            fetchDocs();
            message.success(`${itemToMove.name} moved.`);
        } catch (e) {
            message.error(e.message);
        }
    };

    const importFile = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            await api.importFile(formData);
            message.success("Import successful.");
            fetchDocs();
        } catch (e) {
            message.error(e.message);
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
            message.error(e.message);
        }
    };

    const getTrash = async () => {
        try {
            const data = await api.fetchTrash();
            setTrashedItems(data || []);
            setView('trash');
        } catch (e) {
            message.error(e.message);
        }
    };

    const restoreItem = async (id) => {
        try {
            await api.restoreItemFromTrash(id);
            message.success("Item restored");
            getTrash();
            fetchDocs();
        } catch (e) {
            message.error(e.message);
        }
    };

    const deletePermanently = async (id) => {
        try {
            await api.deleteItemPermanently(id);
            message.success("Item permanently deleted");
            getTrash();
        } catch (e) {
            message.error(e.message);
        }
    };

    const handleEmptyTrash = () => {
        Modal.confirm({
            title: 'Empty Recycle Bin?',
            content: 'Are you sure you want to permanently delete all items in the recycle bin? This action cannot be undone.',
            okText: 'Empty',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await api.emptyTrash();
                    message.success('Recycle bin emptied.');
                    setTrashedItems([]);
                    fetchLogs();
                } catch (e) {
                    message.error(e.message);
                }
            },
        });
    };

    const handleResolveConflicts = async () => {
        setIsResolving(true);
        setConflictResults(null);
        try {
            const operations = await api.resolveNameConflicts();
            setConflictResults(operations || []);
            if (operations && operations.length > 0) {
                message.success("Naming conflicts have been resolved.", 5);
            } else {
                message.success("No naming conflicts found.");
            }
            fetchDocs();
            fetchLogs();
        } catch (e) {
            message.error(e.message);
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
        images,
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
        fetchDocContent,
        saveDoc,
        createNote,
        renameItem,
        confirmDelete,
        createFolder,
        moveItem,
        importFile,
        exportAll,
        getTrash,
        restoreItem,
        deletePermanently,
        handleEmptyTrash,
        handleResolveConflicts,
        conflictResults,
        setConflictResults,
        activityLogs,
        fetchLogs,
        handleClearLogs,
        fetchImages,
        handleDeleteImage,
        navigateToPath,
    };
};

export default useNotes;


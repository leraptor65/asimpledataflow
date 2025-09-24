import { useState, useEffect, useMemo, useRef } from 'react';
import { notification } from 'antd';
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

    const [conflictResults, setConflictResults] = useState(null);
    const [markdownFixResults, setMarkdownFixResults] = useState(null);
    const [activityLogs, setActivityLogs] = useState('');
    const [isFixingMarkdown, setIsFixingMarkdown] = useState(false);


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
            notification.error({
                message: "Error fetching documents",
                description: e.message,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const fetchLogs = async () => {
        try {
            const logs = await api.fetchLogs();
            setActivityLogs(logs);
        } catch (e) {
            notification.error({
                message: "Error fetching logs",
                description: e.message,
            });
        }
    };

    const handleClearLogs = async () => {
        try {
            await api.clearLogs();
            notification.success({ message: "Activity log cleared." });
            fetchLogs(); // Refresh logs to show it's empty
        } catch(e) {
            notification.error({
                message: "Error clearing logs",
                description: e.message,
            });
        }
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
            notification.error({
                message: "Error fetching content",
                description: e.message,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const saveDoc = async () => {
        if (!selectedDoc) return;
        try {
            await api.saveDocument(selectedDoc, markdown); // markdown state is updated by Lexical's OnChangePlugin
            notification.success({
                message: "Document saved.",
            });
            fetchDocs();
        } catch (e) {
            notification.error({
                message: "Error saving document",
                description: e.message,
            });
        }
    };

    const createNote = async () => {
        if (!newNoteName) {
            notification.warning({ message: "Note name cannot be empty." });
            return;
        }
        const finalPath = currentFolder ? `${currentFolder}/${newNoteName}` : newNoteName;
        try {
            await api.createNote(finalPath, '# New Document\n\nWrite your content here.');
            setNewNoteName('');
            setIsNewNoteModalVisible(false);
            fetchDocs();
            fetchDocContent(finalPath);
            notification.success({
                message: "Note created.",
            });
        } catch (e) {
            notification.error({
                message: "Error creating note",
                description: e.message,
            });
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
            notification.success({ message: `${itemToRename.name} renamed.` });
        } catch (e) {
            notification.error({ message: "Error renaming item", description: e.message });
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
            notification.success({ message: `${itemToDelete.name} moved to recycle bin.` });
        } catch (e) {
            notification.error({ message: "Error deleting item", description: e.message });
        }
    };

    const createFolder = async () => {
        if (!newFolderName) {
            notification.warning({ message: "Folder name cannot be empty." });
            return;
        }
        const fullPath = folderToCreateIn ? `${folderToCreateIn}/${newFolderName}` : newFolderName;
        try {
            await api.createFolder(fullPath);
            setIsNewFolderModalVisible(false);
            fetchDocs();
            notification.success({ message: "Folder created." });
        } catch (e) {
            notification.error({ message: "Error creating folder", description: e.message });
        }
    };

    const moveItem = async () => {
        if (!itemToMove) return;

        const destinationPath = destinationFolder === '' ? '' : destinationFolder;
        const currentDirectory = itemToMove.path.substring(0, itemToMove.path.lastIndexOf('/'));

        if (destinationPath === currentDirectory) {
            notification.error({
                message: "Cannot move item to its current location.",
            });
            setIsMoveModalVisible(false);
            return;
        }

        const newPath = destinationFolder ? `${destinationFolder}/${itemToMove.name}` : itemToMove.name;

        try {
            await api.renameItem(itemToMove.path, newPath)
            setIsMoveModalVisible(false);
            fetchDocs();
            notification.success({
                message: `${itemToMove.name} moved.`,
            });
        } catch (e) {
            notification.error({
                message: "Error moving item",
                description: e.message,
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
            });
            fetchDocs();
        } catch (e) {
            notification.error({
                message: "Import failed.",
                description: e.message,
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
            });
        }
    };

    const getTrash = async () => {
        try {
            const data = await api.fetchTrash();
            setTrashedItems(data || []);
            setView('trash');
        } catch (e) {
            notification.error({ message: "Error", description: e.message });
        }
    };

    const restoreItem = async (id) => {
        try {
            await api.restoreItemFromTrash(id);
            notification.success({ message: "Item restored" });
            getTrash();
            fetchDocs();
        } catch (e) {
            notification.error({ message: "Error", description: e.message });
        }
    };

    const deletePermanently = async (id) => {
        try {
            await api.deleteItemPermanently(id);
            notification.success({ message: "Item permanently deleted" });
            getTrash();
        } catch (e) {
            notification.error({ message: "Error", description: e.message });
        }
    };

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
                });
            } else {
                notification.success({
                    message: "Data integrity check complete",
                    description: "No naming conflicts found.",
                });
            }
            fetchDocs();
            fetchLogs();
        } catch (e) {
            notification.error({
                message: "Error checking data integrity",
                description: e.message,
            });
        } finally {
            setIsResolving(false);
        }
    };

    const handleFixMarkdownFiles = async () => {
        setIsFixingMarkdown(true);
        setMarkdownFixResults(null);
        try {
            const operations = await api.fixMarkdownFiles();
            setMarkdownFixResults(operations || []);
            if (operations && operations.length > 0) {
                notification.success({
                    message: "Markdown fix complete",
                    description: `${operations.length} file(s) were updated.`,
                    duration: 5,
                });
            } else {
                notification.success({
                    message: "Markdown fix complete",
                    description: "No files needed fixing.",
                });
            }
            fetchLogs(); // Refresh logs to show new changes
        } catch (e) {
            notification.error({
                message: "Error fixing markdown files",
                description: e.message,
            });
        } finally {
            setIsFixingMarkdown(false);
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
        handleResolveConflicts,
        conflictResults,
        setConflictResults,
        handleFixMarkdownFiles,
        isFixingMarkdown,
        markdownFixResults,
        setMarkdownFixResults,
        activityLogs,
        fetchLogs,
        handleClearLogs,
    };
};

export default useNotes;


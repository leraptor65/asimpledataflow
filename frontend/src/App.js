import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    MDXEditor,
    headingsPlugin,
    listsPlugin,
    quotePlugin,
    thematicBreakPlugin,
    toolbarPlugin,
    UndoRedo,
    BoldItalicUnderlineToggles,
    linkPlugin,
    linkDialogPlugin,
    imagePlugin,
    tablePlugin,
    frontmatterPlugin,
    codeBlockPlugin,
    codeMirrorPlugin,
    diffSourcePlugin,
    markdownShortcutPlugin,
    ListsToggle,
    CreateLink,
    InsertImage,
    InsertTable,
    InsertThematicBreak,
    InsertCodeBlock,
    ChangeCodeMirrorLanguage,
    ConditionalContents,
    Separator,
    BlockTypeSelect,
    DiffSourceToggleWrapper,
} from '@mdxeditor/editor';
import {
    Layout,
    Typography,
    Button,
    Input,
    Spin,
    Modal,
    Form,
    Menu,
    Grid,
    Switch,
    notification,
    Card,
    Tree,
    Space,
    Tooltip,
    Dropdown,
    Empty,
    ConfigProvider,
    theme,
} from 'antd';
import {
    SearchOutlined,
    SettingOutlined,
    PlusOutlined,
    SyncOutlined,
    DeleteOutlined,
    MoreOutlined,
    FolderOutlined,
    FileOutlined,
    CaretRightOutlined,
    CaretDownOutlined,
    HomeOutlined,
    MinusSquareOutlined,
    PlusSquareOutlined,
} from '@ant-design/icons';
import { FolderIcon, HomeIcon, TrashIcon } from './icons';

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const TableOfContents = ({ title, items, onSelect }) => {
    if (!items || items.length === 0) {
        return (
            <div>
                <Title level={2} style={{ marginBottom: '1rem' }}>{title}</Title>
                <Empty description="This folder is empty." />
            </div>
        );
    }

    return (
        <div>
            <Title level={2} style={{ marginBottom: '1rem' }}>{title}</Title>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                {items.map((item) => (
                    <Card
                        key={item.path}
                        hoverable
                        onClick={() => onSelect(item)}
                    >
                        <Space>
                            {item.type === 'folder' ? <FolderOutlined /> : <FileOutlined />}
                            <Text>{item.name.replace(/\.md$/, '')}</Text>
                        </Space>
                    </Card>
                ))}
            </div>
        </div>
    );
};

const buildTreeData = ({ items, onRename, onDelete, onNewNoteInFolder, onNewFolder, onExportItem, onMoveItem }) => {
    return items.map(item => {
        const menuItems = [
            ...(item.type === 'folder'
                ? [
                    { key: 'new-note', label: 'New Note', onClick: (e) => { e.domEvent.stopPropagation(); onNewNoteInFolder(item.path); } },
                    { key: 'new-folder', label: 'New Folder', onClick: (e) => { e.domEvent.stopPropagation(); onNewFolder(item.path); } },
                ]
                : []),
            { key: 'rename', label: 'Rename', onClick: (e) => { e.domEvent.stopPropagation(); onRename(item); } },
            { key: 'delete', label: 'Delete', onClick: (e) => { e.domEvent.stopPropagation(); onDelete(item); } },
            { key: 'move', label: 'Move', onClick: (e) => { e.domEvent.stopPropagation(); onMoveItem(item); } },
            { key: 'export', label: 'Export', onClick: (e) => { e.domEvent.stopPropagation(); onExportItem(item); } },
        ];

        const title = (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <Space>
                    {item.type === 'folder' ? <FolderOutlined /> : null}
                    <span>{item.name}</span>
                </Space>
                <Dropdown
                    menu={{ items: menuItems }}
                    trigger={['click']}
                >
                    <Button type="text" icon={<MoreOutlined />} size="small" onClick={(e) => e.stopPropagation()} />
                </Dropdown>
            </div>
        );

        const node = {
            title,
            key: item.path,
        };

        if (item.children && item.children.length > 0) {
            node.children = buildTreeData({ items: item.children, onRename, onDelete, onNewNoteInFolder, onNewFolder, onExportItem, onMoveItem });
        }

        return node;
    });
};

const FileTree = ({ items, onSelect, onRename, onDelete, onNewNoteInFolder, onNewFolder, onExportItem, selectedDoc, onSelectFolder, onMoveItem, expandedKeys, setExpandedKeys }) => {

    const treeData = useMemo(() => buildTreeData({ items, onRename, onDelete, onNewNoteInFolder, onNewFolder, onExportItem, onMoveItem }), [items, onRename, onDelete, onNewNoteInFolder, onNewFolder, onExportItem, onMoveItem]);

    useEffect(() => {
        if (selectedDoc) {
            const parts = selectedDoc.split('/');
            parts.pop();
            let currentPath = '';
            const keysToExpand = [];
            for (const part of parts) {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                keysToExpand.push(currentPath);
            }
            setExpandedKeys(prev => [...new Set([...prev, ...keysToExpand])]);
        }
    }, [selectedDoc, setExpandedKeys]);

    const handleSelect = (selectedKeys, { node }) => {
        if (selectedKeys.length > 0) {
            const selectedPath = selectedKeys[0];
            let selectedItem;
            const findItem = (currentItems) => {
                for (const item of currentItems) {
                    if (item.path === selectedPath) {
                        selectedItem = item;
                        return;
                    }
                    if (item.children) {
                        findItem(item.children);
                    }
                    if (selectedItem) return;
                }
            };
            findItem(items);

            if (selectedItem) {
                if (selectedItem.type === 'file') {
                    onSelect(selectedPath);
                } else {
                    onSelectFolder(selectedItem);
                    setExpandedKeys(keys => {
                        const index = keys.indexOf(selectedPath);
                        if (index > -1) {
                            return [...keys.slice(0, index), ...keys.slice(index + 1)];
                        }
                        return [...keys, selectedPath];
                    });
                }
            }
        }
    };

    return (
        <Tree
            treeData={treeData}
            onSelect={handleSelect}
            selectedKeys={selectedDoc ? [selectedDoc] : []}
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys)}
            showIcon={false}
            switcherIcon={({ expanded }) => expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
            blockNode
        />
    );
};

const buildFolderTreeData = (items) => {
    const folderItems = items.filter(item => item.type === 'folder');
    return folderItems.map(item => {
        const node = {
            title: item.name,
            key: item.path,
            icon: <FolderOutlined />,
        };
        if (item.children && item.children.length > 0) {
            const childFolders = buildFolderTreeData(item.children);
            if (childFolders.length > 0) {
                node.children = childFolders;
            }
        }
        return node;
    });
};


const TrashView = ({ items, onRestore, onDelete }) => {
    if (items.length === 0) {
        return <Empty description="The recycle bin is empty." />;
    }

    return (
        <div>
            <Title level={2} style={{ marginBottom: '1rem' }}>Recycle Bin</Title>
            <Space direction="vertical" style={{ width: '100%' }}>
                {items.map((item) => (
                    <Card key={item.path}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Space>
                                {item.type === 'file' ? <FileOutlined /> : <FolderOutlined />}
                                <Text>{item.name}</Text>
                            </Space>
                            <Space>
                                <Tooltip title="Restore">
                                    <Button icon={<SyncOutlined />} onClick={() => onRestore(item.path)} />
                                </Tooltip>
                                <Tooltip title="Delete Permanently">
                                    <Button icon={<DeleteOutlined />} danger onClick={() => onDelete(item.path)} />
                                </Tooltip>
                            </Space>
                        </div>
                    </Card>
                ))}
            </Space>
        </div>
    );
};

const SettingsView = ({ onImport, onExportAll, fileInputRef, toggleTheme, isDarkMode }) => {
    return (
        <div>
            <Title level={2} style={{ marginBottom: '1rem' }}>Settings</Title>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Card title="Appearance">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Text style={{ marginRight: '1rem' }}>Dark Mode</Text>
                        <Switch checked={isDarkMode} onChange={toggleTheme} />
                    </div>
                </Card>
                <Card title="Import">
                    <Text style={{ marginBottom: '1rem', display: 'block' }}>Import notes from a .md or .zip file.</Text>
                    <Input type="file" ref={fileInputRef} onChange={onImport} style={{ display: 'none' }} />
                    <Button type="primary" onClick={() => fileInputRef.current.click()}>
                        Import
                    </Button>
                </Card>
                <Card title="Export">
                    <Text style={{ marginBottom: '1rem', display: 'block' }}>Export all notes as a .zip file.</Text>
                    <Button onClick={onExportAll}>
                        Export All
                    </Button>
                </Card>
            </Space>
        </div>
    );
};

function App() {
    const [documents, setDocuments] = useState([]);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [markdown, setMarkdown] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [view, setView] = useState('welcome'); // 'welcome', 'document', 'folder', 'trash', 'settings', 'image', 'text'
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [trashedItems, setTrashedItems] = useState([]);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const editorRef = useRef(null);
    const [diffMarkdown, setDiffMarkdown] = useState('');
    const [fileContent, setFileContent] = useState(null);

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
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [itemToMove, setItemToMove] = useState(null);
    const [destinationFolder, setDestinationFolder] = useState('');
    const [expandedKeys, setExpandedKeys] = useState([]);

    const API_URL = '/api';
    const fileInputRef = React.useRef();

    const SIDEBAR_WIDTH = 280;
    const screens = useBreakpoint();

    useEffect(() => {
        const savedTheme = localStorage.getItem('darkMode');
        if (savedTheme) {
            setIsDarkMode(JSON.parse(savedTheme));
        }
        fetchDocuments();
    }, []);

    const toggleTheme = (checked) => {
        setIsDarkMode(checked);
        localStorage.setItem('darkMode', JSON.stringify(checked));
    };

    const fetchDocuments = async () => {
        try {
            const response = await fetch(`${API_URL}/documents`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
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

    const fetchDocumentContent = async (id) => {
        if (!id) return;
        try {
            const response = await fetch(`${API_URL}/documents/${id}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
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
                setDiffMarkdown(content);
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
        }
    };

    const saveDocument = async () => {
        if (!selectedDoc) return;
        try {
            const currentMarkdown = editorRef.current?.getMarkdown();
            const response = await fetch(`${API_URL}/documents/${selectedDoc}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'text/markdown',
                },
                body: currentMarkdown,
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            notification.success({
                message: "Document saved.",
            });
            fetchDocuments();
        } catch (e) {
            notification.error({
                message: "Error saving document",
                description: e.message,
            });
        }
    };

    const handleCreateNote = async () => {
        if (!newNoteName) {
            notification.warning({ message: "Note name cannot be empty." });
            return;
        }
        const finalPath = currentFolder ? `${currentFolder}/${newNoteName}` : newNoteName;
        try {
            const response = await fetch(`${API_URL}/documents/${finalPath}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'text/markdown' },
                body: '# New Document\n\nWrite your content here.',
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            setNewNoteName('');
            setIsNewNoteModalVisible(false);
            fetchDocuments();
            fetchDocumentContent(finalPath);
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

    const handleRename = async () => {
        if (!itemToRename || !newNoteName) return;
        const newPath = newNoteName;

        try {
            const response = await fetch(`${API_URL}/documents/${itemToRename.path}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPath: newPath }),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            setIsRenameModalVisible(false);
            fetchDocuments();
            notification.success({ message: `${itemToRename.name} renamed.` });
        } catch (e) {
            notification.error({ message: "Error renaming item", description: e.message });
        }
    };

    const handleDelete = (item) => {
        setItemToDelete(item);
        setIsDeleteModalVisible(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            const response = await fetch(`${API_URL}/documents/${itemToDelete.path}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            setIsDeleteModalVisible(false);
            fetchDocuments();
            if (selectedDoc === itemToDelete.path) {
                setView('welcome');
                setSelectedDoc(null);
            }
            notification.success({ message: `${itemToDelete.name} moved to recycle bin.` });
        } catch (e) {
            notification.error({ message: "Error deleting item", description: e.message });
        }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName) {
            notification.warning({ message: "Folder name cannot be empty." });
            return;
        }
        const fullPath = folderToCreateIn ? `${folderToCreateIn}/${newFolderName}` : newFolderName;
        try {
            const response = await fetch(`${API_URL}/folders/${fullPath}`, {
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            setIsNewFolderModalVisible(false);
            fetchDocuments();
            notification.success({ message: "Folder created." });
        } catch (e) {
            notification.error({ message: "Error creating folder", description: e.message });
        }
    };

    const handleMove = async () => {
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
            const response = await fetch(`${API_URL}/documents/${itemToMove.path}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPath: newPath }),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            setIsMoveModalVisible(false);
            fetchDocuments();
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

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${API_URL}/import`, {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }
            notification.success({
                message: "Import successful.",
            });
            fetchDocuments();
        } catch (e) {
            notification.error({
                message: "Import failed.",
                description: e.message,
            });
        }
    };

    const handleExportAll = async () => {
        try {
            const response = await fetch(`${API_URL}/export/`);
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

    const fetchTrash = async () => {
        try {
            const response = await fetch(`${API_URL}/trash`);
            if (!response.ok) throw new Error("Could not fetch trash items");
            const data = await response.json();
            setTrashedItems(data || []);
            setView('trash');
        } catch (e) {
            notification.error({ message: "Error", description: e.message });
        }
    };

    const handleRestoreItem = async (id) => {
        try {
            const response = await fetch(`${API_URL}/trash/restore/${id}`, { method: 'PUT' });
            if (!response.ok) throw new Error("Could not restore item");
            notification.success({ message: "Item restored" });
            fetchTrash();
            fetchDocuments();
        } catch (e) {
            notification.error({ message: "Error", description: e.message });
        }
    };

    const handleDeletePermanently = async (id) => {
        try {
            const response = await fetch(`${API_URL}/trash/delete/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error("Could not delete item permanently");
            notification.success({ message: "Item permanently deleted" });
            fetchTrash();
        } catch (e) {
            notification.error({ message: "Error", description: e.message });
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


    const handleTocSelect = (item) => {
        if (item.type === 'file') {
            fetchDocumentContent(item.path);
        } else {
            setSelectedFolder(item);
            setView('folder');
        }
    };

    const getAllKeys = (items) => {
        let keys = [];
        for (const item of items) {
            if (item.type === 'folder') {
                keys.push(item.path);
                if (item.children) {
                    keys = [...keys, ...getAllKeys(item.children)];
                }
            }
        }
        return keys;
    };

    const imageUploadHandler = async (image) => {
        const formData = new FormData();
        formData.append('image', image);

        try {
            const response = await fetch(`${API_URL}/images`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Upload failed with status: ${response.status}, ${errorText}`);
            }

            const json = await response.json();
            return json.url;
        } catch (e) {
            notification.error({
                message: "Image upload failed",
                description: e.message,
            });
            throw e;
        }
    };

    const renderMainContent = () => {
        switch (view) {
            case 'document':
                return (
                    <>
                        <Title level={2} style={{ marginBottom: '1rem' }}>
                            {selectedDoc}
                        </Title>
                        <div style={{ flex: '1 1 auto', overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: '2px', backgroundColor: '#fff', display: 'flex', flexDirection: 'column' }}>
                            <MDXEditor
                                key={selectedDoc}
                                markdown={markdown}
                                onChange={setMarkdown}
                                ref={editorRef}
                                className={isDarkMode ? 'dark-editor' : ''}
                                contentEditableClassName="prose"
                                plugins={[
                                    toolbarPlugin({
                                        toolbarContents: () => (
                                            <DiffSourceToggleWrapper>
                                                <ConditionalContents
                                                    options={[
                                                        {
                                                            when: (editor) => editor?.editorType === 'codeblock',
                                                            contents: () => <ChangeCodeMirrorLanguage />
                                                        },
                                                        {
                                                            fallback: () => (
                                                                <>
                                                                    <UndoRedo />
                                                                    <Separator />
                                                                    <BoldItalicUnderlineToggles />
                                                                    <Separator />
                                                                    <ListsToggle />
                                                                    <Separator />
                                                                    <BlockTypeSelect />
                                                                    <Separator />
                                                                    <CreateLink />
                                                                    <InsertImage />
                                                                    <InsertTable />
                                                                    <InsertThematicBreak />
                                                                    <Separator />
                                                                    <InsertCodeBlock />
                                                                </>
                                                            )
                                                        }
                                                    ]}
                                                />
                                            </DiffSourceToggleWrapper>
                                        )
                                    }),
                                    headingsPlugin(),
                                    listsPlugin(),
                                    quotePlugin(),
                                    thematicBreakPlugin(),
                                    linkPlugin(),
                                    linkDialogPlugin(),
                                    imagePlugin({ imageUploadHandler }),
                                    tablePlugin(),
                                    frontmatterPlugin(),
                                    codeBlockPlugin({ defaultCodeBlockLanguage: 'txt' }),
                                    codeMirrorPlugin({
                                        codeBlockLanguages: {
                                            js: 'JavaScript',
                                            css: 'CSS',
                                            txt: 'text',
                                            tsx: 'TypeScript',
                                            bash: 'Bash',
                                            powershell: 'PowerShell',
                                            python: 'Python',
                                            html: 'HTML',
                                        }
                                    }),
                                    diffSourcePlugin({ diffMarkdown: diffMarkdown, viewMode: 'rich-text' }),
                                    markdownShortcutPlugin()
                                ]}
                            />
                        </div>
                        <Button type="primary" onClick={saveDocument} style={{ alignSelf: 'flex-end', marginTop: '1rem' }}>
                            Save Document
                        </Button>
                    </>
                );
            case 'image':
                return (
                    <>
                        <Title level={2} style={{ marginBottom: '1rem' }}>
                            {selectedDoc}
                        </Title>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                            <img src={fileContent} alt={selectedDoc} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                        </div>
                    </>
                );
            case 'text':
                return (
                    <>
                        <Title level={2} style={{ marginBottom: '1rem' }}>
                            {selectedDoc}
                        </Title>
                        <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', flex: 1 }}>
                            {fileContent}
                        </pre>
                    </>
                );
            case 'folder':
                return <TableOfContents title={selectedFolder.name} items={selectedFolder.children} onSelect={handleTocSelect} />;
            case 'trash':
                return <TrashView items={trashedItems} onRestore={handleRestoreItem} onDelete={handleDeletePermanently} />;
            case 'settings':
                return <SettingsView onImport={handleImport} onExportAll={handleExportAll} fileInputRef={fileInputRef} toggleTheme={toggleTheme} isDarkMode={isDarkMode} />;
            case 'welcome':
            default:
                return <TableOfContents title="Home" items={documents} onSelect={handleTocSelect} />;
        }
    };

    return (
        <ConfigProvider
            theme={{
                algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
            }}
        >
            <Layout style={{ minHeight: '100vh' }}>
                <Sider
                    collapsible
                    collapsed={isSidebarCollapsed}
                    onCollapse={(collapsed) => setIsSidebarCollapsed(collapsed)}
                    width={SIDEBAR_WIDTH}
                    collapsedWidth={screens.xs ? 0 : 80}
                    theme={isDarkMode ? 'dark' : 'light'}
                    style={{
                        overflow: 'auto',
                        height: '100vh',
                        position: 'fixed',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        zIndex: 1,
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ padding: '0.5rem', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarCollapsed ? 'center' : 'space-between' }}>
                                {!isSidebarCollapsed && (
                                    <Title level={4} style={{ color: isDarkMode ? '#fff' : 'rgba(0, 0, 0, 0.85)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        A Simple Data Flow
                                    </Title>
                                )}
                                <Button
                                    icon={<HomeOutlined />}
                                    onClick={() => { setView('welcome'); setSelectedDoc(null); }}
                                    type="text"
                                    style={{ color: isDarkMode ? '#fff' : 'rgba(0, 0, 0, 0.85)' }}
                                />
                            </div>
                            {!isSidebarCollapsed && (
                                <div style={{ marginTop: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <Button
                                            type="primary"
                                            icon={<PlusOutlined />}
                                            onClick={() => {
                                                setCurrentFolder('');
                                                setIsNewNoteModalVisible(true);
                                            }}
                                            style={{ flex: 1, width: '100%' }}
                                        >
                                            New Note
                                        </Button>
                                        <Button onClick={() => setIsNewFolderModalVisible(true)} style={{ flex: 1, width: '100%' }}>
                                            New Folder
                                        </Button>
                                    </div>
                                    <Input
                                        placeholder="Search..."
                                        prefix={<SearchOutlined />}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        style={{ marginTop: '1rem' }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                        <Tooltip title="Expand All">
                                            <Button icon={<PlusSquareOutlined />} size="small" onClick={() => setExpandedKeys(getAllKeys(documents))} />
                                        </Tooltip>
                                        <Tooltip title="Collapse All">
                                            <Button icon={<MinusSquareOutlined />} size="small" onClick={() => setExpandedKeys([])} style={{ marginLeft: '0.5rem' }} />
                                        </Tooltip>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ flex: '1 1 auto', overflowY: 'auto', overflowX: 'hidden', paddingRight: '8px', height: '100%' }}>
                            {!isSidebarCollapsed && (
                                isLoading ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                        <Spin />
                                    </div>
                                ) : (
                                    <FileTree
                                        items={filteredDocuments}
                                        onSelect={fetchDocumentContent}
                                        onSelectFolder={(folder) => {
                                            setSelectedFolder(folder);
                                            setView('folder');
                                        }}
                                        onRename={(item) => { setItemToRename(item); setNewNoteName(item.name); setIsRenameModalVisible(true); }}
                                        onDelete={handleDelete}
                                        onNewNoteInFolder={(path) => { setCurrentFolder(path); setNewNoteName(''); setIsNewNoteModalVisible(true); }}
                                        onNewFolder={(path) => { setFolderToCreateIn(path); setNewFolderName(''); setIsNewFolderModalVisible(true); }}
                                        onExportItem={(item) => { window.open(`${API_URL}/export/${item.path}`, '_blank'); }}
                                        selectedDoc={selectedDoc}
                                        onMoveItem={(item) => { setItemToMove(item); setDestinationFolder(''); setIsMoveModalVisible(true); }}
                                        expandedKeys={expandedKeys}
                                        setExpandedKeys={setExpandedKeys}
                                    />
                                )
                            )}
                        </div>
                        <Menu theme={isDarkMode ? 'dark' : 'light'} mode="vertical" inlineCollapsed={isSidebarCollapsed}>
                            <Menu.Item key="trash" icon={<TrashIcon />} onClick={fetchTrash}>
                                {!isSidebarCollapsed && 'Recycle Bin'}
                            </Menu.Item>
                            <Menu.Item key="settings" icon={<SettingOutlined />} onClick={() => setView('settings')}>
                                {!isSidebarCollapsed && 'Settings'}
                            </Menu.Item>
                        </Menu>
                    </div>
                </Sider>
                <Layout style={{ marginLeft: isSidebarCollapsed ? (screens.xs ? 0 : 80) : SIDEBAR_WIDTH, transition: 'margin-left 0.2s' }}>
                    <Content style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' }}>
                        {renderMainContent()}
                    </Content>
                </Layout>

                <Modal title="Create New Note" open={isNewNoteModalVisible} onOk={handleCreateNote} onCancel={() => setIsNewNoteModalVisible(false)}>
                    <Form>
                        <Form.Item label="Note name">
                            <Input
                                placeholder="note-name"
                                value={newNoteName}
                                onChange={(e) => setNewNoteName(e.target.value)}
                                onPressEnter={handleCreateNote}
                            />
                        </Form.Item>
                    </Form>
                </Modal>

                <Modal title={`Rename ${itemToRename?.type}`} open={isRenameModalVisible} onOk={handleRename} onCancel={() => setIsRenameModalVisible(false)}>
                    <Form>
                        <Form.Item label="New name">
                            <Input
                                value={newNoteName}
                                onChange={(e) => setNewNoteName(e.target.value)}
                                onPressEnter={handleRename}
                            />
                        </Form.Item>
                    </Form>
                </Modal>

                <Modal
                    title={`Delete ${itemToDelete?.type}`}
                    open={isDeleteModalVisible}
                    onOk={confirmDelete}
                    onCancel={() => setIsDeleteModalVisible(false)}
                    okText="Delete"
                    cancelText="Cancel"
                    okButtonProps={{ danger: true }}
                >
                    <p>Are you sure you want to move "{itemToDelete?.name}" to the recycle bin?</p>
                </Modal>

                <Modal title="Create New Folder" open={isNewFolderModalVisible} onOk={handleCreateFolder} onCancel={() => setIsNewFolderModalVisible(false)}>
                    <Form>
                        <Form.Item label="Folder name">
                            <Input
                                placeholder="folder-name"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                onPressEnter={handleCreateFolder}
                            />
                        </Form.Item>
                    </Form>
                </Modal>

                <Modal title={`Move "${itemToMove?.name}"`} open={isMoveModalVisible} onOk={handleMove} onCancel={() => setIsMoveModalVisible(false)}>
                    <Form>
                        <Form.Item label="Select a destination folder">
                            <Tree
                                treeData={[
                                    { title: 'Root', key: '', icon: <FolderOutlined /> },
                                    ...buildFolderTreeData(documents)
                                ]}
                                onSelect={(selectedKeys) => {
                                    setDestinationFolder(selectedKeys[0] || '');
                                }}
                                selectedKeys={destinationFolder ? [destinationFolder] : ['']}
                                defaultExpandAll
                                showIcon
                                blockNode
                            />
                        </Form.Item>
                    </Form>
                </Modal>
            </Layout>
        </ConfigProvider>
    );
}

export default App;
import React from 'react';
import { Layout, Input, Button, Tooltip, Menu, Typography, Grid } from 'antd';
import {
    SearchOutlined,
    PlusOutlined,
    HomeOutlined,
    SettingOutlined,
    MinusSquareOutlined,
    PlusSquareOutlined,
} from '@ant-design/icons';
import { TrashIcon } from '../icons';
import FileTree from './FileTree';

const { Sider } = Layout;
const { Title } = Typography;
const { useBreakpoint } = Grid;


const Sidebar = ({ notes, isSidebarCollapsed, setIsSidebarCollapsed, toggleTheme, isDarkMode }) => {
    const screens = useBreakpoint();
    const {
        documents,
        setSelectedDoc,
        searchQuery,
        setSearchQuery,
        filteredDocuments,
        setView,
        setCurrentFolder,
        setIsNewNoteModalVisible,
        setIsNewFolderModalVisible,
        setFolderToCreateIn,
        setNewFolderName,
        fetchDocContent,
        setSelectedFolder,
        setItemToRename,
        setNewNoteName,
        setIsRenameModalVisible,
        setItemToDelete,
        setIsDeleteModalVisible,
        setItemToMove,
        setDestinationFolder,
        setIsMoveModalVisible,
        getTrash,
        setExpandedKeys,
        expandedKeys
    } = notes;

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


    const menuItems = [
        {
            key: 'trash',
            icon: <TrashIcon />,
            label: isSidebarCollapsed ? null : 'Recycle Bin',
            onClick: () => { getTrash(); setSelectedDoc(null); },
        },
        {
            key: 'settings',
            icon: <SettingOutlined />,
            label: isSidebarCollapsed ? null : 'Settings',
            onClick: () => { setView('settings'); setSelectedDoc(null); },
        },
    ];

    return (
        <Sider
            collapsible
            collapsed={isSidebarCollapsed}
            onCollapse={(collapsed) => setIsSidebarCollapsed(collapsed)}
            width={280}
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
                            onClick={() => { setView('welcome'); setSelectedDoc(null); window.history.pushState(null, '', '/'); }}
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
                                <Button onClick={() => { setFolderToCreateIn(''); setNewFolderName(''); setIsNewFolderModalVisible(true) }} style={{ flex: 1, width: '100%' }}>
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
                <div className="file-tree-container" style={{ flex: '1 1 auto', overflowY: 'auto', overflowX: 'hidden', paddingRight: '8px', height: '100%' }}>
                    {!isSidebarCollapsed && (
                        <FileTree
                            items={filteredDocuments}
                            onSelect={fetchDocContent}
                            onSelectFolder={(folder) => {
                                setSelectedFolder(folder);
                                setView('folder');
                            }}
                            onRename={(item) => { setItemToRename(item); setNewNoteName(item.name); setIsRenameModalVisible(true); }}
                            onDelete={(item) => { setItemToDelete(item); setIsDeleteModalVisible(true); }}
                            onNewNoteInFolder={(path) => { setCurrentFolder(path); setNewNoteName(''); setIsNewNoteModalVisible(true); }}
                            onNewFolder={(path) => { setFolderToCreateIn(path); setNewFolderName(''); setIsNewFolderModalVisible(true); }}
                            onExportItem={(item) => { window.open(`/api/export/${item.path}`, '_blank'); }}
                            selectedDoc={notes.selectedDoc}
                            onMoveItem={(item) => { setItemToMove(item); setDestinationFolder(''); setIsMoveModalVisible(true); }}
                            expandedKeys={expandedKeys}
                            setExpandedKeys={setExpandedKeys}
                        />
                    )}
                </div>
                <Menu
                    theme={isDarkMode ? 'dark' : 'light'}
                    mode="inline"
                    inlineCollapsed={isSidebarCollapsed}
                    items={menuItems}
                />
            </div>
        </Sider>
    );
};

export default Sidebar;

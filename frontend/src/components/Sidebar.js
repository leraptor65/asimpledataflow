import React from 'react';
import { Layout, Input, Button, Tooltip, Menu, Typography, List } from 'antd';
import {
    SearchOutlined,
    PlusOutlined,
    HomeOutlined,
    SettingOutlined,
    MinusSquareOutlined,
    PlusSquareOutlined,
    FileTextOutlined,
} from '@ant-design/icons';
import { TrashIcon } from '../icons';
import FileTree from './FileTree';

const { Sider } = Layout;
const { Title } = Typography;

const Sidebar = ({ notes, isSidebarCollapsed, setIsSidebarCollapsed, isDarkMode }) => {
    const {
        documents,
        searchQuery,
        setSearchQuery,
        searchResults,
        setView,
        setCurrentFolder,
        setIsNewNoteModalVisible,
        setIsNewFolderModalVisible,
        setFolderToCreateIn,
        setNewFolderName,
        setSelectedFolder,
        setItemToRename,
        setNewNoteName,
        setIsRenameModalVisible,
        setItemToDelete,
        setIsDeleteModalVisible,
        setItemToMove,
        setDestinationFolder,
        setIsMoveModalVisible,
        setExpandedKeys,
        expandedKeys,
        handleCreateShareLink,
        encodePath,
    } = notes;

    const navigate = (path) => {
        window.history.pushState(null, '', path);
        const popStateEvent = new PopStateEvent('popstate');
        window.dispatchEvent(popStateEvent);
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


    const menuItems = [
        {
            key: 'trash',
            icon: <TrashIcon />,
            label: isSidebarCollapsed ? null : 'Recycle Bin',
            onClick: () => navigate('/trash'),
        },
        {
            key: 'settings',
            icon: <SettingOutlined />,
            label: isSidebarCollapsed ? null : 'Settings',
            onClick: () => navigate('/settings'),
        },
    ];

    return (
        <Sider
            collapsible
            collapsed={isSidebarCollapsed}
            onCollapse={(collapsed) => setIsSidebarCollapsed(collapsed)}
            width={280}
            collapsedWidth={80}
            theme={isDarkMode ? 'dark' : 'light'}
            style={{
                overflow: 'auto',
                height: '100vh',
                position: 'fixed',
                left: 0,
                top: 0,
                bottom: 0,
                zIndex: 10,
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: '0.5rem', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    {!isSidebarCollapsed && (
                        <Title level={4} style={{
                            color: isDarkMode ? '#fff' : 'rgba(0, 0, 0, 0.85)',
                            margin: 0,
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%'
                        }}>
                            A Simple Data Flow
                        </Title>
                    )}
                    <Button
                        icon={<HomeOutlined />}
                        onClick={() => navigate('/')}
                        type="text"
                        style={{
                            color: isDarkMode ? '#fff' : 'rgba(0, 0, 0, 0.85)',
                            fontSize: '18px'
                        }}
                    />
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
                                allowClear
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
                    {!isSidebarCollapsed &&
                        (searchQuery ? (
                            <List
                                dataSource={searchResults}
                                renderItem={(item) => (
                                    <List.Item
                                        onClick={() => {
                                            navigate(`/data/${encodePath(item.path)}`);
                                            setSearchQuery(''); // Clear search after clicking
                                        }}
                                        style={{ cursor: 'pointer', padding: '8px 16px', color: isDarkMode ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.85)' }}
                                        className="search-result-item"
                                    >
                                        <FileTextOutlined style={{ marginRight: 8 }} />
                                        {item.path.replace(/_/g, ' ')}
                                    </List.Item>
                                )}
                                size="small"
                            />
                        ) : (
                            <FileTree
                                items={documents}
                                onSelect={(path) => navigate(`/data/${encodePath(path)}`)}
                                onSelectFolder={(folder) => {
                                    setSelectedFolder(folder);
                                    setView('folder');
                                }}
                                onRename={(item) => { setItemToRename(item); setNewNoteName(item.name); setIsRenameModalVisible(true); }}
                                onDelete={(item) => { setItemToDelete(item); setIsDeleteModalVisible(true); }}
                                onNewNoteInFolder={(path) => { setCurrentFolder(path); setNewNoteName(''); setIsNewNoteModalVisible(true); }}
                                onNewFolder={(path) => { setFolderToCreateIn(path); setNewFolderName(''); setIsNewFolderModalVisible(true); }}
                                onExportItem={(item) => { window.open(`/api/export/${encodePath(item.path)}`, '_blank'); }}
                                onShareItem={handleCreateShareLink}
                                selectedDoc={notes.selectedDoc}
                                onMoveItem={(item) => { setItemToMove(item); setDestinationFolder(''); setIsMoveModalVisible(true); }}
                                expandedKeys={expandedKeys}
                                setExpandedKeys={setExpandedKeys}
                                encodePath={encodePath}
                            />
                        ))}
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

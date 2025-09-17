import React, { useMemo, useEffect } from 'react';
import { Tree, Button, Dropdown, Space } from 'antd';
import { FolderOutlined, FileOutlined, MoreOutlined, CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons';

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
                    {item.type === 'folder' ? <FolderOutlined /> : <FileOutlined />}
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
            style={{ background: 'transparent' }}
        />
    );
};

export default FileTree;
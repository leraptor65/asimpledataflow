import React from 'react';
import { Modal, Form, Input, Tree } from 'antd';
import { FolderOutlined } from '@ant-design/icons';


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


export const Modals = ({ notes }) => {
    const {
        isNewNoteModalVisible,
        setIsNewNoteModalVisible,
        newNoteName,
        setNewNoteName,
        createNote,
        isRenameModalVisible,
        setIsRenameModalVisible,
        itemToRename,
        renameItem,
        isDeleteModalVisible,
        setIsDeleteModalVisible,
        itemToDelete,
        confirmDelete,
        isNewFolderModalVisible,
        setIsNewFolderModalVisible,
        newFolderName,
        setNewFolderName,
        createFolder,
        isMoveModalVisible,
        setIsMoveModalVisible,
        itemToMove,
        moveItem,
        setDestinationFolder,
        destinationFolder,
        documents
    } = notes;
    return (
        <>
            <Modal title="Create New Note" open={isNewNoteModalVisible} onOk={createNote} onCancel={() => setIsNewNoteModalVisible(false)}>
                <Form>
                    <Form.Item label="Note name">
                        <Input
                            placeholder="note-name"
                            value={newNoteName}
                            onChange={(e) => setNewNoteName(e.target.value)}
                            onPressEnter={createNote}
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal title={`Rename ${itemToRename?.type}`} open={isRenameModalVisible} onOk={renameItem} onCancel={() => setIsRenameModalVisible(false)}>
                <Form>
                    <Form.Item label="New name">
                        <Input
                            value={newNoteName}
                            onChange={(e) => setNewNoteName(e.target.value)}
                            onPressEnter={renameItem}
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

            <Modal title="Create New Folder" open={isNewFolderModalVisible} onOk={createFolder} onCancel={() => setIsNewFolderModalVisible(false)}>
                <Form>
                    <Form.Item label="Folder name">
                        <Input
                            placeholder="folder-name"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onPressEnter={createFolder}
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal title={`Move "${itemToMove?.name}"`} open={isMoveModalVisible} onOk={moveItem} onCancel={() => setIsMoveModalVisible(false)}>
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
        </>
    );
};
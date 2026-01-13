import React from 'react';
import { Modal, Form, Input, Tree, Button, notification } from 'antd';
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

export const ShareLinkModal = ({ visible, onCancel, shareUrl }) => {
    const handleCopy = () => {
        navigator.clipboard.writeText(shareUrl)
            .then(() => notification.success({ message: 'Link copied to clipboard!', placement: 'top' }))
            .catch(() => notification.error({ message: 'Failed to copy link.', placement: 'top' }));
    };

    return (
        <Modal
            title="Shareable Link"
            open={visible}
            onCancel={onCancel}
            footer={[
                <Button key="copy" type="primary" onClick={handleCopy}>
                    Copy Link
                </Button>,
                <Button key="close" onClick={onCancel}>
                    Close
                </Button>,
            ]}
        >
            <p>This link will expire in 24 hours by default. You can change this in the settings. Anyone with the link can view this document.</p>
            <Input value={shareUrl} readOnly />
        </Modal>
    );
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
        documents,
        isShareLinkModalVisible,
        setIsShareLinkModalVisible,
        activeShareLink,
        setFolderToCreateIn,
        folderToCreateIn,
    } = notes;
    return (
        <>
            <Modal title="Create New Note" open={isNewNoteModalVisible} onOk={createNote} onCancel={() => setIsNewNoteModalVisible(false)}>
                <Form layout="vertical">
                    <Form.Item label="Save Location (Folder)" help="Select a folder or leave empty for root. You can also type a path (e.g. 'Projects/Drafts').">
                        <Tree
                            treeData={[
                                { title: 'Root', key: '', icon: <FolderOutlined /> },
                                ...buildFolderTreeData(documents)
                            ]}
                            onSelect={(selectedKeys) => {
                                setFolderToCreateIn(selectedKeys[0] || '');
                            }}
                            selectedKeys={folderToCreateIn ? [folderToCreateIn] : ['']}
                            showIcon
                            blockNode
                            height={200}
                        />
                        <div style={{ marginTop: '8px' }}>
                            <Input
                                placeholder="Or type path..."
                                value={folderToCreateIn}
                                onChange={(e) => setFolderToCreateIn(e.target.value)}
                            />
                        </div>
                    </Form.Item>
                    <Form.Item label="Note Name">
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
                <Form layout="vertical">
                    <Form.Item label="Parent Folder" help="Select a parent folder. Recursive paths supported.">
                        <Tree
                            treeData={[
                                { title: 'Root', key: '', icon: <FolderOutlined /> },
                                ...buildFolderTreeData(documents)
                            ]}
                            onSelect={(selectedKeys) => {
                                setFolderToCreateIn(selectedKeys[0] || '');
                            }}
                            selectedKeys={folderToCreateIn ? [folderToCreateIn] : ['']}
                            showIcon
                            blockNode
                            height={200}
                        />
                        <div style={{ marginTop: '8px' }}>
                            <Input
                                placeholder="Or type path..."
                                value={folderToCreateIn}
                                onChange={(e) => setFolderToCreateIn(e.target.value)}
                            />
                        </div>
                    </Form.Item>
                    <Form.Item label="New Folder Name">
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
                                { title: 'Home', key: '', icon: <FolderOutlined /> },
                                ...buildFolderTreeData(documents)
                            ]}
                            onSelect={(selectedKeys) => {
                                setDestinationFolder(selectedKeys[0] || '');
                            }}
                            selectedKeys={destinationFolder ? [destinationFolder] : ['']}
                            showIcon
                            blockNode
                        />
                    </Form.Item>
                </Form>
            </Modal>
            <ShareLinkModal
                visible={isShareLinkModalVisible}
                onCancel={() => setIsShareLinkModalVisible(false)}
                shareUrl={activeShareLink ? `${window.location.origin}/share/${activeShareLink.id}` : ''}
            />
        </>
    );
};


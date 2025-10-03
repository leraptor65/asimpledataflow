import React, { useState, useMemo } from 'react';
import { Modal, Input, List, Typography } from 'antd';

const { Text } = Typography;

export const ReferenceModal = ({ notes }) => {
    const { isReferenceModalVisible, setIsReferenceModalVisible, allFiles, editorApi, setEditorApi } = notes;
    const [searchText, setSearchText] = useState('');

    const filteredFiles = useMemo(() => {
        if (!searchText) {
            return allFiles;
        }
        return allFiles.filter(file =>
            file.path.toLowerCase().includes(searchText.toLowerCase())
        );
    }, [allFiles, searchText]);

    const handleSelect = (path) => {
        if (editorApi) {
            const textToInsert = `@(${path})`;
            editorApi.replaceSelection(textToInsert);
        }
        setIsReferenceModalVisible(false);
        setSearchText('');
        setEditorApi(null); // Clear the api after use
    };

    const handleCancel = () => {
        setIsReferenceModalVisible(false);
        setSearchText('');
        setEditorApi(null); // Clear the api on cancel
    };

    return (
        <Modal
            title="Reference a document"
            open={isReferenceModalVisible}
            onCancel={handleCancel}
            footer={null}
            destroyOnClose
        >
            <Input.Search
                placeholder="Search documents"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ marginBottom: '1rem' }}
                autoFocus
            />
            <List
                dataSource={filteredFiles}
                renderItem={(item) => (
                    <List.Item
                        onClick={() => handleSelect(item.path)}
                        style={{ cursor: 'pointer' }}
                    >
                        <Text>{item.path.replace(/_/g, ' ')}</Text>
                    </List.Item>
                )}
                style={{ maxHeight: '400px', overflowY: 'auto' }}
            />
        </Modal>
    );
};


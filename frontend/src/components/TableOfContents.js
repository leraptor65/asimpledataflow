import React from 'react';
import { Card, Empty, Space, Typography, List } from 'antd';
import { FolderOutlined, FileTextOutlined } from '@ant-design/icons';

const { Text } = Typography;

const TableOfContents = ({ folder, onSelect, renderBreadcrumbs }) => {
    if (!folder || !folder.children || folder.children.length === 0) {
        return (
            <div>
                {renderBreadcrumbs(folder.path)}
                <Empty description="This folder is empty." style={{ marginTop: '2rem' }} />
            </div>
        );
    }

    // Separate folders and files
    const folders = folder.children.filter(item => item.type === 'folder');
    const files = folder.children.filter(item => item.type !== 'folder');

    // Combine them with folders first
    const sortedItems = [...folders, ...files];

    return (
        <div>
            {renderBreadcrumbs(folder.path)}
            <List
                style={{ marginTop: '1rem', background: 'transparent' }}
                dataSource={sortedItems}
                renderItem={(item) => (
                    <List.Item
                        style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}
                        className="search-result-item"
                        onClick={() => onSelect(item)}
                    >
                        <List.Item.Meta
                            avatar={item.type === 'folder' ? <FolderOutlined style={{ fontSize: '20px', color: '#1a73e8' }} /> : <FileTextOutlined style={{ fontSize: '20px', color: '#5f6368' }} />}
                            title={<Text style={{ fontSize: '16px' }}>{item.name.replace(/\.md$/, '')}</Text>}
                        />
                    </List.Item>
                )}
            />
        </div>
    );
};

export default TableOfContents;


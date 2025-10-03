import React from 'react';
import { Card, Empty, Space, Typography } from 'antd';
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                {sortedItems.map((item) => (
                    <Card
                        key={item.path}
                        hoverable
                        onClick={() => onSelect(item)}
                    >
                        <Space>
                            {item.type === 'folder' ? <FolderOutlined /> : <FileTextOutlined />}
                            <Text>{item.name.replace(/\.md$/, '')}</Text>
                        </Space>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default TableOfContents;


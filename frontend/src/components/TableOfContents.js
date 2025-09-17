import React from 'react';
import { Card, Empty, Space, Typography } from 'antd';
import { FileOutlined, FolderOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

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

export default TableOfContents;
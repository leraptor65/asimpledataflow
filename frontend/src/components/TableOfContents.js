import React from 'react';
import { Card, Empty, Space, Typography, Breadcrumb } from 'antd';
import { FolderOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const TableOfContents = ({ title, items, onSelect, notes }) => {
    const { navigateToPath } = notes;

    const renderBreadcrumbTitle = () => {
        if (title === 'Home' || !title) {
            return <Title level={2} style={{ marginBottom: '1rem' }}>Home</Title>
        }
        
        const pathParts = title.split('/');

        let accumulatedPath = '';
        const breadcrumbItems = pathParts.map((part) => {
            accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
            const linkPath = accumulatedPath;

            return (
                <Breadcrumb.Item key={linkPath}>
                    <a onClick={() => navigateToPath(linkPath)}>{part}</a>
                </Breadcrumb.Item>
            );
        });

        return (
             <Title level={2} style={{ marginBottom: '1rem' }}>
                <Breadcrumb separator=">">
                    <Breadcrumb.Item>
                        <a onClick={() => navigateToPath('')}>Home</a>
                    </Breadcrumb.Item>
                    {breadcrumbItems}
                </Breadcrumb>
            </Title>
        );
    };

    if (!items || items.length === 0) {
        return (
            <div>
                {renderBreadcrumbTitle()}
                <Empty description="This folder is empty." />
            </div>
        );
    }

    return (
        <div>
            {renderBreadcrumbTitle()}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                {items.map((item) => (
                    <Card
                        key={item.path}
                        hoverable
                        onClick={() => onSelect(item)}
                    >
                        <Space>
                            {item.type === 'folder' ? <FolderOutlined /> : null}
                            <Text>{item.name.replace(/\.md$/, '')}</Text>
                        </Space>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default TableOfContents;

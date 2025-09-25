import React from 'react';
import { Button, Card, Empty, Space, Tooltip, Typography } from 'antd';
import { DeleteOutlined, FolderOutlined, SyncOutlined } from '@ant-design/icons';


const { Title, Text } = Typography;

const TrashView = ({ items, onRestore, onDelete, onEmptyTrash }) => {

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <Title level={2} style={{ margin: 0 }}>Recycle Bin</Title>
                {items.length > 0 && (
                    <Button danger onClick={onEmptyTrash}>
                        Empty Recycle Bin
                    </Button>
                )}
            </div>

            {items.length === 0 ? (
                <Empty description="The recycle bin is empty." />
            ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                    {items.map((item) => (
                        <Card key={item.path}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Space>
                                    {item.type === 'file' ? null : <FolderOutlined />}
                                    <Text>{item.name}</Text>
                                </Space>
                                <Space>
                                    <Tooltip title="Restore">
                                        <Button icon={<SyncOutlined />} onClick={() => onRestore(item.path)} />
                                    </Tooltip>
                                    <Tooltip title="Delete Permanently">
                                        <Button icon={<DeleteOutlined />} danger onClick={() => onDelete(item.path)} />
                                    </Tooltip>
                                </Space>
                            </div>
                        </Card>
                    ))}
                </Space>
            )}
        </div>
    );
};

export default TrashView;

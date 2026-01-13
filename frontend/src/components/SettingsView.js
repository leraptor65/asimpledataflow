import React, { useEffect } from 'react';
import { Button, Card, Switch, Typography, List, Empty, Space, Image, Tooltip, Modal, Dropdown, Menu } from 'antd';
import { SyncOutlined, DeleteOutlined, ExclamationCircleOutlined, DownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Title, Text, Paragraph } = Typography;
const { confirm } = Modal;

const SettingsView = ({
    onImport,
    onExportAll,
    fileInputRef,
    toggleTheme,
    isDarkMode,
    onResolveConflicts,
    isResolving,
    conflictResults,
    setConflictResults,
    activityLogs,
    fetchLogs,
    onClearLogs,
    images,
    fetchImages,
    onDeleteImage,
    isMobile,
    sharedLinks,
    fetchSharedLinks,
    handleDeleteShareLink,
    handleUpdateShareLink,
}) => {
    const handleImportClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    useEffect(() => {
        fetchLogs();
        fetchImages();
        fetchSharedLinks();
        return () => {
            setConflictResults(null);
        };
    }, [fetchLogs, fetchImages, fetchSharedLinks, setConflictResults]);

    const showDeleteConfirm = (name) => {
        confirm({
            title: 'Are you sure you want to delete this image?',
            icon: <ExclamationCircleOutlined />,
            content: 'This action cannot be undone.',
            okText: 'Yes, delete it',
            okType: 'danger',
            cancelText: 'No',
            onOk() {
                onDeleteImage(name);
            },
        });
    };

    const getExpirationMenu = (linkId) => (
        <Menu onClick={({ key }) => handleUpdateShareLink(linkId, key)}>
            <Menu.Item key="1h">1 Hour</Menu.Item>
            <Menu.Item key="24h">24 Hours</Menu.Item>
            <Menu.Item key="168h">7 Days</Menu.Item>
            <Menu.Item key="never">Never</Menu.Item>
        </Menu>
    );

    return (
        <div>
            {!isMobile && <Title level={2} style={{ marginBottom: '1rem' }}>Settings</Title>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Card title="Appearance">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Text style={{ marginRight: '1rem' }}>Dark Mode</Text>
                        <Switch checked={isDarkMode} onChange={toggleTheme} />
                    </div>
                </Card>
                <Card title="Manage Shared Links">
                    <List
                        dataSource={sharedLinks || []}
                        renderItem={item => (
                            <List.Item
                                actions={[
                                    <Dropdown overlay={getExpirationMenu(item.id)} trigger={['click']}>
                                        <Button size="small">
                                            Change Expiry <DownOutlined />
                                        </Button>
                                    </Dropdown>,
                                    <Tooltip title="Revoke Link">
                                        <Button icon={<DeleteOutlined />} danger size="small" onClick={() => handleDeleteShareLink(item.id)} />
                                    </Tooltip>
                                ]}
                            >
                                <List.Item.Meta
                                    title={<a href={`/share/${item.id}`} target="_blank" rel="noopener noreferrer">{item.documentPath.replace(/_/g, ' ')}</a>}
                                    description={item.expiresAt ? `Expires ${dayjs(item.expiresAt).fromNow()}` : 'Never expires'}
                                />
                            </List.Item>
                        )}
                        locale={{ emptyText: <Empty description="No active shared links." /> }}
                    />
                </Card>
                <Card title="Data Integrity">
                    <Paragraph>
                        Scans for and resolves any files or folders with conflicting names (e.g., "Test" and "test.md" in the same folder).
                    </Paragraph>
                    <Button onClick={onResolveConflicts} loading={isResolving}>
                        Check and Resolve Conflicts
                    </Button>
                    {conflictResults && (
                        <div style={{ marginTop: '1rem' }}>
                            {conflictResults.length > 0 ? (
                                <List
                                    header={<Text strong>Renamed Items:</Text>}
                                    bordered
                                    dataSource={conflictResults || []}
                                    renderItem={item => (
                                        <List.Item>
                                            <Text type="secondary">{item.oldPath}</Text>
                                            <Text style={{ margin: '0 8px' }}>→</Text>
                                            <Text strong>{item.newPath}</Text>
                                        </List.Item>
                                    )}
                                />
                            ) : (
                                <Empty description="No naming conflicts found." />
                            )}
                        </div>
                    )}
                </Card>
                <Card title="Import">
                    <Paragraph>Import notes from a .md or .zip file.</Paragraph>
                    <input type="file" ref={fileInputRef} onChange={onImport} style={{ display: 'none' }} />
                    <Button type="primary" onClick={handleImportClick} style={{ display: 'block', marginTop: '8px' }}>
                        Import
                    </Button>
                </Card>

                <Card title="Export">
                    <Paragraph>Export all notes as a .zip file.</Paragraph>
                    <Button onClick={onExportAll} style={{ display: 'block', marginTop: '8px' }}>
                        Export All
                    </Button>
                </Card>
                <Card title="Image Management">
                    <List
                        grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 4, xl: 6, xxl: 8 }}
                        dataSource={images || []}
                        renderItem={item => (
                            <List.Item>
                                <Card
                                    hoverable
                                    cover={<Image alt={item.name} src={item.url} style={{ height: 120, objectFit: 'cover' }} />}
                                    actions={[
                                        <Tooltip title="Delete Permanently">
                                            <Button icon={<DeleteOutlined />} danger onClick={() => showDeleteConfirm(item.name)} />
                                        </Tooltip>,
                                    ]}
                                >
                                    <Card.Meta description={item.name} style={{ textAlign: 'center' }} />
                                </Card>
                            </List.Item>
                        )}
                        locale={{ emptyText: <Empty description="No images found in the .images folder." /> }}
                    />
                </Card>
                <Card
                    title="Activity Log"
                    extra={
                        <Space>
                            <Button icon={<SyncOutlined />} size="small" onClick={fetchLogs}>
                                Refresh
                            </Button>
                            <Button icon={<DeleteOutlined />} size="small" danger onClick={onClearLogs}>
                                Clear
                            </Button>
                        </Space>
                    }
                >
                    <pre className="activity-log-pre">
                        {activityLogs || "No activity yet."}
                    </pre>
                </Card>
            </div>
        </div>
    );
};

export default SettingsView;


import React, { useEffect } from 'react';
import { Button, Card, Switch, Typography, List, Empty, Space, Image, Tooltip, Modal } from 'antd';
import { SyncOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

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
    isMobile
}) => {
    const handleImportClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    useEffect(() => {
        fetchLogs();
        fetchImages();
        return () => {
            setConflictResults(null);
        };
    }, [fetchLogs, fetchImages, setConflictResults]);

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
                                    dataSource={conflictResults}
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
                        dataSource={images}
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

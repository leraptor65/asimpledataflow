import React, { useEffect } from 'react';
import { Button, Card, Switch, Typography, List, Empty, Space, Image, Tooltip } from 'antd';
import { SyncOutlined, DeleteOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

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

    return (
        <div>
            <Title level={2} style={{ marginBottom: '1rem' }}>Settings</Title>
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
                    <Button type="primary" onClick={handleImportClick}>
                        Import
                    </Button>
                </Card>
                <Card title="Export">
                    <Paragraph>Export all notes as a .zip file.</Paragraph>
                    <Button onClick={onExportAll}>
                        Export All
                    </Button>
                </Card>
                <Card
                    title="Image Management"
                    extra={
                        <Button
                            icon={<SyncOutlined />}
                            onClick={(e) => { e.stopPropagation(); fetchImages(); }}
                        >
                            Refresh
                        </Button>
                    }
                >
                    <Image.PreviewGroup>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
                            {images.length > 0 ? (
                                images.map(image => (
                                    <Card
                                        key={image}
                                        hoverable
                                        cover={<Image alt={image} src={`/images/${image}`} style={{ height: 100, objectFit: 'cover' }} />}
                                        bodyStyle={{ padding: '8px', textAlign: 'center' }}
                                    >
                                        <Card.Meta
                                            description={
                                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                    <Text style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{image}</Text>
                                                    <Tooltip title="Delete">
                                                        <Button
                                                            icon={<DeleteOutlined />}
                                                            danger
                                                            size="small"
                                                            onClick={() => onDeleteImage(image)}
                                                            style={{ marginLeft: 8 }}
                                                        />
                                                    </Tooltip>
                                                </div>
                                            }
                                        />
                                    </Card>
                                ))
                            ) : (
                                <Empty description="No images found." style={{ gridColumn: '1 / -1' }} />
                            )}
                        </div>
                    </Image.PreviewGroup>
                </Card>
                <Card
                    title="Activity Log"
                    extra={
                        <Space>
                            <Button
                                icon={<SyncOutlined />}
                                onClick={(e) => { e.stopPropagation(); fetchLogs(); }}
                            >
                                Refresh
                            </Button>
                            <Button
                                icon={<DeleteOutlined />}
                                danger
                                onClick={(e) => { e.stopPropagation(); onClearLogs(); }}
                            >
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


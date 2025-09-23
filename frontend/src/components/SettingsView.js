import React, { useEffect } from 'react';
import { Button, Card, Switch, Typography, List, Empty, Collapse, Space } from 'antd';
import { SyncOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

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
    onFixMarkdown,
    isFixingMarkdown,
    markdownFixResults,
    setMarkdownFixResults,
    activityLogs,
    fetchLogs,
}) => {
    const handleImportClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    useEffect(() => {
        // Fetch logs when the component mounts
        fetchLogs();
        // Clear results when component unmounts
        return () => {
            setConflictResults(null);
            setMarkdownFixResults(null);
        };
    }, [fetchLogs, setConflictResults, setMarkdownFixResults]);

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
                <Card title="Markdown Cleanup">
                    <Paragraph>
                        Scans all `.md` files for common formatting errors, like broken image links or improper horizontal rules, and fixes them automatically.
                    </Paragraph>
                    <Button onClick={onFixMarkdown} loading={isFixingMarkdown}>
                        Scan and Fix Markdown
                    </Button>
                    {markdownFixResults && (
                        <div style={{ marginTop: '1rem' }}>
                            {markdownFixResults.length > 0 ? (
                                <List
                                    header={<Text strong>Fixed Files:</Text>}
                                    bordered
                                    dataSource={markdownFixResults}
                                    renderItem={item => (
                                        <List.Item>
                                            <Text strong>{item.path}</Text>
                                        </List.Item>
                                    )}
                                />
                            ) : (
                                <Empty description="No markdown errors found." />
                            )}
                        </div>
                    )}
                </Card>
                <Card title="Import & Export">
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <div>
                            <Text>Import notes from a .md or .zip file.</Text>
                            <input type="file" ref={fileInputRef} onChange={onImport} style={{ display: 'none' }} />
                            <Button type="primary" onClick={handleImportClick} style={{ display: 'block', marginTop: '8px' }}>
                                Import
                            </Button>
                        </div>
                        <div>
                            <Text>Export all notes as a .zip file.</Text>
                            <Button onClick={onExportAll} style={{ display: 'block', marginTop: '8px' }}>
                                Export All
                            </Button>
                        </div>
                    </Space>
                </Card>
                <Collapse>
                    <Panel
                        header="Activity Log"
                        key="1"
                        extra={
                            <Button
                                icon={<SyncOutlined />}
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    fetchLogs();
                                }}
                            >
                                Refresh
                            </Button>
                        }
                    >
                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '300px', overflowY: 'auto', background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                            {activityLogs || "No activity yet."}
                        </pre>
                    </Panel>
                </Collapse>
            </div>
        </div>
    );
};

export default SettingsView;


import React from 'react';
import { Button, Card, Switch, Typography } from 'antd';

const { Title, Text } = Typography;

const SettingsView = ({ onImport, onExportAll, fileInputRef, toggleTheme, isDarkMode, onResolveConflicts, isResolving }) => {
    const handleImportClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

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
                    <Text style={{ marginBottom: '1rem', display: 'block' }}>
                        Scans for and resolves any files or folders with conflicting names (e.g., "Test" and "test.md" in the same folder).
                    </Text>
                    <Button onClick={onResolveConflicts} loading={isResolving}>
                        Check and Resolve Conflicts
                    </Button>
                </Card>
                <Card title="Import">
                    <Text style={{ marginBottom: '1rem', display: 'block' }}>Import notes from a .md or .zip file.</Text>
                    <input type="file" ref={fileInputRef} onChange={onImport} style={{ display: 'none' }} />
                    <Button type="primary" onClick={handleImportClick}>
                        Import
                    </Button>
                </Card>
                <Card title="Export">
                    <Text style={{ marginBottom: '1rem', display: 'block' }}>Export all notes as a .zip file.</Text>
                    <Button onClick={onExportAll}>
                        Export All
                    </Button>
                </Card>
            </div>
        </div>
    );
};

export default SettingsView;


import React from 'react';
import { Button, Card, Input, Space, Switch, Typography } from 'antd';

const { Title, Text } = Typography;

const SettingsView = ({ onImport, onExportAll, fileInputRef, toggleTheme, isDarkMode }) => {
    return (
        <div>
            <Title level={2} style={{ marginBottom: '1rem' }}>Settings</Title>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Card title="Appearance">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Text style={{ marginRight: '1rem' }}>Dark Mode</Text>
                        <Switch checked={isDarkMode} onChange={toggleTheme} />
                    </div>
                </Card>
                <Card title="Import">
                    <Text style={{ marginBottom: '1rem', display: 'block' }}>Import notes from a .md or .zip file.</Text>
                    <Input type="file" ref={fileInputRef} onChange={onImport} style={{ display: 'none' }} />
                    <Button type="primary" onClick={() => fileInputRef.current.click()}>
                        Import
                    </Button>
                </Card>
                <Card title="Export">
                    <Text style={{ marginBottom: '1rem', display: 'block' }}>Export all notes as a .zip file.</Text>
                    <Button onClick={onExportAll}>
                        Export All
                    </Button>
                </Card>
            </Space>
        </div>
    );
};

export default SettingsView;
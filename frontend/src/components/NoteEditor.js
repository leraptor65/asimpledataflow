import React, { useEffect, useState, useRef } from 'react';
import { Button, Typography, Spin, notification, Breadcrumb } from 'antd';
import { PictureOutlined, HomeOutlined } from '@ant-design/icons';
import MDEditor, { commands } from '@uiw/react-md-editor';
import * as api from '../api';

import TableOfContents from './TableOfContents';
import TrashView from './TrashView';
import SettingsView from './SettingsView';


const { Title } = Typography;

// Custom command for image upload
const imageUploadCommand = {
    name: 'image-upload',
    keyCommand: 'imageUpload',
    buttonProps: { 'aria-label': 'Insert image' },
    icon: <PictureOutlined style={{ fontSize: '16px' }} />,
    execute: (state, executeApi) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (event) => {
            const file = event.target.files[0];
            if (file) {
                const formData = new FormData();
                formData.append('image', file);
                try {
                    const res = await api.uploadImage(formData);
                    const { url } = res;
                    // Insert the image markdown
                    const modifyText = `![${file.name}](${url})\n`;
                    executeApi.replaceSelection(modifyText);
                } catch (error) {
                    notification.error({
                        message: "Image upload failed",
                        description: error.message,
                        placement: 'top',
                    });
                }
            }
        };
        input.click();
    },
};

// Custom component to render <pre> tags with a copy button
const CustomPre = ({ children, ...props }) => {
    const preRef = useRef(null);
    const [lang, setLang] = useState('text');

    useEffect(() => {
        if (preRef.current) {
            const codeElement = preRef.current.querySelector('code');
            if (codeElement) {
                const langMatch = codeElement.className.match(/language-(\w+)/);
                setLang(langMatch ? langMatch[1] : 'text');
            }
        }
    }, [children]);

    const handleCopy = () => {
        if (preRef.current) {
            const code = preRef.current.innerText;
            navigator.clipboard.writeText(code).then(() => {
                notification.success({ message: 'Copied!', duration: 2, placement: 'top' });
            }).catch(() => {
                notification.error({ message: 'Failed to copy.', duration: 2, placement: 'top' });
            });
        }
    };

    return (
        <div className="code-block-wrapper">
            <div className="code-block-header">
                <span className="code-block-lang">{lang}</span>
                <Button className="code-block-copy-btn" onClick={handleCopy} size="small">Copy</Button>
            </div>
            <pre ref={preRef} {...props}>
                {children}
            </pre>
        </div>
    );
};


const NoteEditor = ({ notes, isDarkMode, toggleTheme }) => {
    const [isEditing, setIsEditing] = useState(false);
    const {
        view,
        selectedDoc,
        markdown,
        setMarkdown,
        fileContent,
        saveDoc,
        selectedFolder,
        importFile,
        exportAll,
        fileInputRef,
        isLoading,
        handleResolveConflicts,
        isResolving,
        conflictResults,
        setConflictResults,
        activityLogs,
        fetchLogs,
        handleClearLogs,
        images,
        fetchImages,
        handleDeleteImage,
        emptyTrash,
        encodePath,
        navigate,
        trashedItems,
        restoreItem,
        deletePermanently,
    } = notes;

    useEffect(() => {
        setIsEditing(false);
    }, [selectedDoc]);

    const handleEditSave = () => {
        if (isEditing) {
            saveDoc();
        }
        setIsEditing(!isEditing);
    }

    const renderBreadcrumbs = (path) => {
        const parts = path ? path.split('/') : [];
        const items = [
            {
                title: <HomeOutlined />,
                onClick: () => navigate('/'),
            },
            ...parts.map((part, index) => {
                const fullPath = parts.slice(0, index + 1).join('/');
                const isLast = index === parts.length - 1;
                const item = {
                    title: part,
                };
                 // Only make it clickable if it's not the last part of the path
                 if (!isLast) {
                    item.onClick = () => navigate(`/data/${encodePath(fullPath)}`);
                }
                return item;
            }),
        ];

        return <Breadcrumb items={items} />;
    };

    const renderMainContent = () => {
        if (isLoading) {
            return (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                    <Spin size="large" />
                </div>
            );
        }

        switch (view) {
            case 'document':
                return (
                    <div data-color-mode={isDarkMode ? 'dark' : 'light'} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, paddingBottom: '1rem' }}>
                            {renderBreadcrumbs(selectedDoc)}
                            <Button type="primary" onClick={handleEditSave}>
                                {isEditing ? 'Save' : 'Edit'}
                            </Button>
                        </div>
                        <div style={{ flex: '1 1 auto', overflow: 'hidden' }}>
                            {isEditing ? (
                                <MDEditor
                                    value={markdown}
                                    onChange={(value) => setMarkdown(value || '')}
                                    height="100%"
                                    style={{ borderRadius: '6px' }}
                                    commands={[
                                        ...commands.getCommands(),
                                        commands.divider,
                                        imageUploadCommand
                                    ]}
                                />
                            ) : (
                                <div className="wmde-markdown" style={{ height: '100%', overflowY: 'auto', padding: '2rem', borderRadius: '6px' }}>
                                    <MDEditor.Markdown
                                        source={markdown}
                                        components={{
                                            pre: CustomPre,
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 'image':
                return (
                    <>
                         {renderBreadcrumbs(selectedDoc)}
                        <div style={{ flex: 1, textAlign: 'center', marginTop: '1rem' }}>
                            <img src={fileContent} alt={selectedDoc} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        </div>
                    </>
                );
            case 'text':
                return (
                    <>
                        {renderBreadcrumbs(selectedDoc)}
                        <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', flex: 1, marginTop: '1rem' }}>
                            {fileContent}
                        </pre>
                    </>
                );
            case 'folder':
                return <TableOfContents
                    folder={selectedFolder}
                    onSelect={(item) => navigate(`/data/${encodePath(item.path)}`)}
                    renderBreadcrumbs={renderBreadcrumbs}
                    />;
            case 'trash':
                return <TrashView items={trashedItems} onRestore={restoreItem} onDelete={deletePermanently} onEmpty={emptyTrash} />;
            case 'settings':
                return <SettingsView
                    onImport={importFile}
                    onExportAll={exportAll}
                    fileInputRef={fileInputRef}
                    toggleTheme={toggleTheme}
                    isDarkMode={isDarkMode}
                    onResolveConflicts={handleResolveConflicts}
                    isResolving={isResolving}
                    conflictResults={conflictResults}
                    setConflictResults={setConflictResults}
                    activityLogs={activityLogs}
                    fetchLogs={fetchLogs}
                    onClearLogs={handleClearLogs}
                    images={images}
                    fetchImages={fetchImages}
                    onDeleteImage={handleDeleteImage}
                />;
            case 'welcome':
            default:
                return <TableOfContents
                    folder={{ path: '', children: notes.documents}}
                    onSelect={(item) => navigate(`/data/${encodePath(item.path)}`)}
                    renderBreadcrumbs={renderBreadcrumbs}
                    />;
        }
    };

    return renderMainContent();
};

export default NoteEditor;


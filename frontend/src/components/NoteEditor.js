import React, { useEffect, useState, useRef } from 'react';
import { Button, Typography, Spin, notification, Breadcrumb, Dropdown, List } from 'antd';
import {
    PictureOutlined,
    HomeOutlined,
    ArrowLeftOutlined,
    MoreOutlined,
    PlusOutlined,
} from '@ant-design/icons';
import MDEditor, { commands } from '@uiw/react-md-editor';
import * as api from '../api';

import TableOfContents from './TableOfContents';
import TrashView from './TrashView';
import SettingsView from './SettingsView';


const { Title, Text } = Typography;


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


const NoteEditor = ({ notes, isDarkMode, toggleTheme, isMobile }) => {
    const [isEditing, setIsEditing] = useState(false);
    const { setEditorApi, setIsReferenceModalVisible } = notes;
    
    const referenceCommand = {
        name: 'reference',
        keyCommand: 'reference',
        buttonProps: { 'aria-label': 'Insert reference' },
        icon: <span style={{ fontSize: '16px', textAlign: 'center' }}>@</span>,
        execute: (state, executeApi) => {
            setEditorApi(() => executeApi);
            setIsReferenceModalVisible(true);
        },
    };

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
        setCurrentFolder,
        setIsNewNoteModalVisible,
        setIsNewFolderModalVisible,
        setFolderToCreateIn,
        setNewFolderName,
        backlinks,
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
                 if (!isLast) {
                    item.onClick = () => navigate(`/data/${encodePath(fullPath)}`);
                }
                return item;
            }),
        ];

        return <Breadcrumb items={items} />;
    };

    const handleBack = () => {
        const currentPath = selectedDoc || selectedFolder?.path;
        if (currentPath) {
            const parts = currentPath.split('/');
            if (parts.length > 1) {
                const parentPath = parts.slice(0, -1).join('/');
                navigate(`/data/${encodePath(parentPath)}`);
            } else {
                navigate('/');
            }
        } else {
            navigate('/');
        }
    };

    const handleNewNote = () => {
        const path = selectedFolder ? selectedFolder.path : (selectedDoc ? selectedDoc.substring(0, selectedDoc.lastIndexOf('/')) : '');
        setCurrentFolder(path);
        setIsNewNoteModalVisible(true);
    };

    const handleNewFolder = () => {
        const path = selectedFolder ? selectedFolder.path : (selectedDoc ? selectedDoc.substring(0, selectedDoc.lastIndexOf('/')) : '');
        setFolderToCreateIn(path);
        setNewFolderName('');
        setIsNewFolderModalVisible(true);
    };

    const mobileMenuItems = [
        { key: 'new-note', label: 'New Note', onClick: handleNewNote, icon: <PlusOutlined /> },
        { key: 'new-folder', label: 'New Folder', onClick: handleNewFolder, icon: <PlusOutlined /> }
    ];

    const mobileMoreMenuItems = [
        ...(view === 'trash' && trashedItems.length > 0 ? [{ key: 'empty-trash', label: 'Empty Recycle Bin', danger: true, onClick: emptyTrash }] : []),
        { key: 'settings', label: 'Settings', onClick: () => navigate('/settings') },
        { key: 'trash', label: 'Recycle Bin', onClick: () => navigate('/trash') },
    ];
    
    // Custom renderer for paragraphs to handle @mentions
    const PTagRenderer = ({ children }) => {
        const newChildren = React.Children.toArray(children).flatMap((child, index) => {
            if (typeof child === 'string') {
                const parts = child.split(/(@\([^)]+\))/g);
                return parts.map((part, i) => {
                    if (part.startsWith('@(') && part.endsWith(')')) {
                        const docPath = part.substring(2, part.length - 1);
                        const docName = docPath.includes('/') ? docPath.substring(docPath.lastIndexOf('/') + 1) : docPath;
                        return (
                            <a
                                key={`${index}-${i}`}
                                href={`/data/${encodePath(docPath)}`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    navigate(`/data/${encodePath(docPath)}`);
                                }}
                                className="internal-link"
                            >
                                @{docName.replace(/_/g, ' ')}
                            </a>
                        );
                    }
                    return part;
                });
            }
            return child;
        });
        return <p>{newChildren}</p>;
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
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                         {!isMobile && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, paddingBottom: '1rem' }}>
                                {renderBreadcrumbs(selectedDoc)}
                                <Button type="primary" onClick={handleEditSave}>
                                    {isEditing ? 'Save' : 'Edit'}
                                </Button>
                            </div>
                        )}
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
                                        imageUploadCommand,
                                        referenceCommand,
                                    ]}
                                />
                            ) : (
                                <div className="wmde-markdown" style={{ height: '100%', overflowY: 'auto', padding: isMobile ? '0.5rem' : '2rem', borderRadius: '6px' }}>
                                    <MDEditor.Markdown
                                        source={markdown}
                                        components={{
                                            pre: CustomPre,
                                            p: PTagRenderer,
                                        }}
                                    />
                                    {backlinks && backlinks.length > 0 && (
                                        <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: isDarkMode ? '1px solid #303030' : '1px solid #e8e8e8' }}>
                                            <Title level={5}>Referenced by</Title>
                                            <List
                                                size="small"
                                                dataSource={backlinks}
                                                renderItem={item => (
                                                    <List.Item>
                                                        <a href={`/data/${encodePath(item)}`} onClick={(e) => {
                                                            e.preventDefault();
                                                            navigate(`/data/${encodePath(item)}`);
                                                        }}><Text>{item.replace(/_/g, ' ')}</Text></a>
                                                    </List.Item>
                                                )}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 'image':
                return (
                    <>
                         {!isMobile && renderBreadcrumbs(selectedDoc)}
                        <div style={{ flex: 1, textAlign: 'center', marginTop: isMobile ? 0 : '1rem' }}>
                            <img src={fileContent} alt={selectedDoc} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        </div>
                    </>
                );
            case 'text':
                return (
                    <>
                        {!isMobile && renderBreadcrumbs(selectedDoc)}
                        <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', flex: 1, marginTop: isMobile ? 0 : '1rem' }}>
                            {fileContent}
                        </pre>
                    </>
                );
            case 'folder':
                return <TableOfContents
                    folder={selectedFolder}
                    onSelect={(item) => navigate(`/data/${encodePath(item.path)}`)}
                    renderBreadcrumbs={!isMobile ? renderBreadcrumbs : () => null}
                    />;
            case 'trash':
                return <TrashView items={trashedItems} onRestore={restoreItem} onDelete={deletePermanently} onEmpty={emptyTrash} isMobile={isMobile}/>;
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
                    isMobile={isMobile}
                />;
            case 'welcome':
            default:
                return <TableOfContents
                    folder={{ path: '', children: notes.documents}}
                    onSelect={(item) => navigate(`/data/${encodePath(item.path)}`)}
                    renderBreadcrumbs={!isMobile ? renderBreadcrumbs : () => null}
                    />;
        }
    };

    return (
        <div data-color-mode={isDarkMode ? 'dark' : 'light'} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Mobile Header */}
            {isMobile && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0, gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Button icon={<HomeOutlined />} onClick={() => navigate('/')} />
                        {view !== 'welcome' && <Button icon={<ArrowLeftOutlined />} onClick={handleBack} />}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {view === 'document' && (
                             <Button type="primary" onClick={handleEditSave}>
                                {isEditing ? 'Save' : 'Edit'}
                            </Button>
                        )}
                        <Dropdown menu={{items: mobileMenuItems}} trigger={['click']}>
                            <Button icon={<PlusOutlined />} />
                        </Dropdown>
                        <Dropdown menu={{items: mobileMoreMenuItems}} trigger={['click']}>
                            <Button icon={<MoreOutlined />} />
                        </Dropdown>
                    </div>
                </div>
            )}
            <div style={{ flex: '1 1 auto', overflowY: 'auto' }}>
                 {renderMainContent()}
            </div>
        </div>
    );
};

export default NoteEditor;


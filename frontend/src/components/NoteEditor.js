import React, { useEffect, useState, useRef } from 'react';
import { Button, Typography, Spin, notification } from 'antd';
import { PictureOutlined } from '@ant-design/icons';
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
                    });
                }
            }
        };
        input.click();
    },
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
        fetchDocContent,
        setSelectedFolder,
        setView,
        trashedItems,
        restoreItem,
        deletePermanently,
        importFile,
        exportAll,
        fileInputRef,
        isLoading,
        handleResolveConflicts,
        isResolving,
        conflictResults,
        setConflictResults,
        handleFixMarkdownFiles,
        isFixingMarkdown,
        markdownFixResults,
        setMarkdownFixResults,
        activityLogs,
        fetchLogs,
        handleClearLogs,
    } = notes;

    const editorWrapperRef = useRef(null);

    useEffect(() => {
        setIsEditing(false);
    }, [selectedDoc]);
    
    useEffect(() => {
        if (view !== 'document' || isLoading || isEditing) {
            return;
        }

        const editorNode = editorWrapperRef.current;
        if (!editorNode) return;

        // This function finds all <pre> elements and adds a wrapper with a copy button.
        const addCopyButtons = (targetNode) => {
            const codeBlocks = targetNode.querySelectorAll ? targetNode.querySelectorAll('pre') : [];

            codeBlocks.forEach(preElement => {
                // If it already has our custom wrapper, skip it.
                if (preElement.parentElement.classList.contains('code-block-wrapper')) {
                    return;
                }

                const codeElement = preElement.querySelector('code');
                if (!codeElement) return;

                const code = codeElement.innerText;
                const langMatch = codeElement.className.match(/language-(\w+)/);
                const lang = langMatch ? langMatch[1] : 'text';

                const wrapper = document.createElement('div');
                wrapper.className = 'code-block-wrapper';
                
                const header = document.createElement('div');
                header.className = 'code-block-header';

                const langText = document.createElement('span');
                langText.className = 'code-block-lang';
                langText.innerText = lang;

                const button = document.createElement('button');
                button.className = 'code-block-copy-btn';
                button.innerText = 'Copy';

                button.onclick = (e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(code).then(() => {
                        notification.success({ message: 'Copied!', duration: 2, placement: 'topRight' });
                    }).catch(() => {
                        notification.error({ message: 'Failed to copy.', duration: 2, placement: 'topRight' });
                    });
                };
                
                header.appendChild(langText);
                header.appendChild(button);
                
                // Insert the wrapper before the <pre> element and move the <pre> inside it.
                preElement.parentNode.insertBefore(wrapper, preElement);
                wrapper.appendChild(header);
                wrapper.appendChild(preElement);
            });
        };

        // Initial run
        addCopyButtons(editorNode);

        // Set up a MutationObserver to handle dynamically added code blocks.
        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        addCopyButtons(node);
                    }
                });
            }
        });

        observer.observe(editorNode, { childList: true, subtree: true });

        // Cleanup observer on component unmount or when dependencies change.
        return () => observer.disconnect();
    }, [view, isLoading, isEditing, markdown]); // Rerun when content changes in preview mode


    const handleEditSave = () => {
        if(isEditing) {
            saveDoc();
        }
        setIsEditing(!isEditing);
    }

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
                            <Title level={2} style={{ margin: 0 }}>
                                {selectedDoc}
                            </Title>
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
                                <div ref={editorWrapperRef} className="wmde-markdown" style={{ height: '100%', overflowY: 'auto', padding: '2rem', borderRadius: '6px' }}>
                                    <MDEditor.Markdown 
                                        source={markdown}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 'image':
                return (
                    <>
                        <Title level={2} style={{ marginBottom: '1rem' }}>
                            {selectedDoc}
                        </Title>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                            <img src={fileContent} alt={selectedDoc} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        </div>
                    </>
                );
            case 'text':
                return (
                    <>
                        <Title level={2} style={{ marginBottom: '1rem' }}>
                            {selectedDoc}
                        </Title>
                        <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', flex: 1 }}>
                            {fileContent}
                        </pre>
                    </>
                );
            case 'folder':
                return <TableOfContents
                    title={selectedFolder.path}
                    items={selectedFolder.children}
                    onSelect={(item) => {
                        if (item.type === 'file') {
                            fetchDocContent(item.path);
                        } else {
                            setSelectedFolder(item);
                            setView('folder');
                        }
                    }} />;
            case 'trash':
                return <TrashView items={trashedItems} onRestore={restoreItem} onDelete={deletePermanently} />;
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
                    onFixMarkdown={handleFixMarkdownFiles}
                    isFixingMarkdown={isFixingMarkdown}
                    markdownFixResults={markdownFixResults}
                    setMarkdownFixResults={setMarkdownFixResults}
                    activityLogs={activityLogs}
                    fetchLogs={fetchLogs}
                    onClearLogs={handleClearLogs}
                />;
            case 'welcome':
            default:
                return <TableOfContents
                    title="Home"
                    items={notes.documents}
                    onSelect={(item) => {
                        if (item.type === 'file') {
                            fetchDocContent(item.path);
                        } else {
                            setSelectedFolder(item);
                            setView('folder');
                        }
                    }} />;
        }
    };

    return renderMainContent();
};

export default NoteEditor;


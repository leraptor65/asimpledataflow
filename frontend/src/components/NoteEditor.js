import React, { useEffect, useState, useRef } from 'react';
import { Button, Typography, Spin, message, Breadcrumb } from 'antd';
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
                    message.error(error.message);
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
        handleEmptyTrash,
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
        navigateToPath
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
                        message.success('Copied!');
                    }).catch(() => {
                        message.error('Failed to copy.');
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

    const renderBreadcrumbTitle = (path) => {
        const pathParts = path ? path.split('/') : [];
        let accumulatedPath = '';
        const breadcrumbItems = pathParts.map((part, index) => {
            const isLast = index === pathParts.length - 1;
            accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
            const linkPath = accumulatedPath;

            if (isLast) {
                return <Breadcrumb.Item key={linkPath}>{part}</Breadcrumb.Item>;
            }

            return (
                <Breadcrumb.Item key={linkPath}>
                    <a onClick={() => navigateToPath(linkPath)}>{part}</a>
                </Breadcrumb.Item>
            );
        });

        return (
             <Title level={2} style={{ margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Breadcrumb separator=">">
                    <Breadcrumb.Item>
                        <a onClick={() => navigateToPath('')}>Home</a>
                    </Breadcrumb.Item>
                    {breadcrumbItems}
                </Breadcrumb>
            </Title>
        );
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
                            {renderBreadcrumbTitle(selectedDoc)}
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
                        {renderBreadcrumbTitle(selectedDoc)}
                        <div style={{ flex: 1, textAlign: 'center', marginTop: '1rem' }}>
                            <img src={fileContent} alt={selectedDoc} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        </div>
                    </>
                );
            case 'text':
                return (
                    <>
                        {renderBreadcrumbTitle(selectedDoc)}
                        <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', flex: 1, marginTop: '1rem' }}>
                            {fileContent}
                        </pre>
                    </>
                );
            case 'folder':
                return <TableOfContents
                    notes={notes}
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
                return <TrashView items={trashedItems} onRestore={restoreItem} onDelete={deletePermanently} onEmptyTrash={handleEmptyTrash} />;
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
                    notes={notes}
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


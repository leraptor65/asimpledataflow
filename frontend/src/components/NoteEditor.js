import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button, Typography, Spin, notification, Dropdown } from 'antd';
import {
    FontColorsOutlined,
    BoldOutlined,
    ItalicOutlined,
    UnderlineOutlined,
    CodeOutlined,
    UnorderedListOutlined,
    OrderedListOutlined,
} from '@ant-design/icons';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import {
    $convertFromMarkdownString,
    $convertToMarkdownString,
    TRANSFORMERS
} from '@lexical/markdown';
import { ListNode, ListItemNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import { HeadingNode, QuoteNode, $createHeadingNode, $isHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { CodeHighlightNode, CodeNode, $createCodeNode } from '@lexical/code';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, UNDO_COMMAND, REDO_COMMAND, $isElementNode } from 'lexical';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CodeHighlightPlugin } from './CodeHighlightPlugin';

import TableOfContents from './TableOfContents';
import TrashView from './TrashView';
import SettingsView from './SettingsView';


const { Title } = Typography;

const editorTheme = {
    code: 'editor-code',
    heading: {
        h1: 'editor-heading-h1',
        h2: 'editor-heading-h2',
        h3: 'editor-heading-h3',
    },
    list: {
        listitem: 'editor-listitem',
        ol: 'editor-list-ol',
        ul: 'editor-list-ul',
    },
    ltr: 'editor-ltr',
    paragraph: 'editor-paragraph',
    quote: 'editor-quote',
    rtl: 'editor-rtl',
    text: {
        bold: 'editor-text-bold',
        code: 'editor-text-code',
        italic: 'editor-text-italic',
        strikethrough: 'editor-text-strikethrough',
        underline: 'editor-text-underline',
        underlineStrikethrough: 'editor-text-underlineStrikethrough',
    },
};

const nodes = [
    HeadingNode,
    ListNode,
    ListItemNode,
    QuoteNode,
    CodeNode,
    CodeHighlightNode,
    LinkNode
];

const ToolbarPlugin = () => {
    const [editor] = useLexicalComposerContext();
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [blockType, setBlockType] = useState('paragraph');

    const updateToolbar = useCallback(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            // Update text format
            setIsBold(selection.hasFormat('bold'));
            setIsItalic(selection.hasFormat('italic'));
            setIsUnderline(selection.hasFormat('underline'));

            // Update block format
            const anchorNode = selection.anchor.getNode();
            const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
            const elementKey = element.getKey();
            const elementDOM = editor.getElementByKey(elementKey);
            if (elementDOM !== null) {
                if ($isHeadingNode(element)) {
                    setBlockType(element.getTag());
                } else {
                    setBlockType(element.getType());
                }
            }
        }
    }, [editor]);

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                updateToolbar();
            });
        });
    }, [editor, updateToolbar]);

    const formatHeading = (headingSize) => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $getRoot().select();
                const node = selection.getNodes()[0];
                const parent = node.getParent();
                if (parent && $isElementNode(parent)) {
                    parent.replace($createHeadingNode(headingSize));
                } else if ($isElementNode(node)) {
                    node.replace($createHeadingNode(headingSize));
                }
            }
        });
    };

    const headingItems = [
        { key: 'h1', label: 'Heading 1', onClick: () => formatHeading('h1') },
        { key: 'h2', label: 'Heading 2', onClick: () => formatHeading('h2') },
        { key: 'h3', label: 'Heading 3', onClick: () => formatHeading('h3') },
    ];


    return (
        <div className="toolbar">
            <Button.Group>
                <Button onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>Undo</Button>
                <Button onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>Redo</Button>
            </Button.Group>
            <Button.Group>
                <Dropdown menu={{ items: headingItems }}>
                    <Button icon={<FontColorsOutlined />}>{blockType.toUpperCase()}</Button>
                </Dropdown>
            </Button.Group>
            <Button.Group>
                <Button onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} type={isBold ? 'primary' : 'default'} icon={<BoldOutlined />} />
                <Button onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')} type={isItalic ? 'primary' : 'default'} icon={<ItalicOutlined />} />
                <Button onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')} type={isUnderline ? 'primary' : 'default'} icon={<UnderlineOutlined />} />
            </Button.Group>
            <Button.Group>
                <Button onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} icon={<UnorderedListOutlined />} />
                <Button onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} icon={<OrderedListOutlined />} />
                <Button onClick={() => editor.update(() => $getRoot().select().insertNodes([$createCodeNode()]))} icon={<CodeOutlined />} />
                <Button onClick={() => editor.update(() => $getRoot().select().insertNodes([$createQuoteNode()]))}>Quote</Button>
            </Button.Group>
        </div>
    );
};


const LexicalEditor = ({ markdown, setMarkdown, isDarkMode, isEditing }) => {
    const initialConfig = {
        namespace: 'MyEditor',
        theme: editorTheme,
        onError(error) {
            console.error(error);
        },
        nodes: nodes,
        editable: isEditing,
        editorState: () => $convertFromMarkdownString(markdown, TRANSFORMERS),
    };

    const handleOnChange = (editorState) => {
        editorState.read(() => {
            const newMarkdown = $convertToMarkdownString(TRANSFORMERS);
            setMarkdown(newMarkdown);
        });
    };

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <div className="editor-container" data-theme={isDarkMode ? 'dark' : 'light'}>
                {isEditing && (
                    <div className="editor-toolbar-wrapper">
                        <ToolbarPlugin />
                    </div>
                )}
                <div className="editor-inner">
                    <RichTextPlugin
                        contentEditable={<ContentEditable className="editor-input" />}
                        placeholder={isEditing ? <div className="editor-placeholder">Enter some text...</div> : null}
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <HistoryPlugin />
                    <OnChangePlugin onChange={handleOnChange} />
                    <ListPlugin />
                    <CodeHighlightPlugin />
                </div>
            </div>
        </LexicalComposer>
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

    useEffect(() => {
        setIsEditing(false);
    }, [selectedDoc]);

    useEffect(() => {
        if (view !== 'document' || isLoading) {
            return;
        }

        const editorRoot = document.querySelector('.editor-input');
        if (!editorRoot) return;

        const addCopyButtons = (targetNode) => {
            const codeBlocks = targetNode.querySelectorAll ? targetNode.querySelectorAll('pre.editor-code') : [];
            codeBlocks.forEach(preElement => {
                if (preElement.parentElement.classList.contains('code-block-wrapper')) {
                    return;
                }

                const codeElement = preElement.querySelector('code');
                if (!codeElement) return;

                const code = codeElement.innerText;
                const lang = codeElement.getAttribute('data-highlight-language') || 'text';

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
                
                preElement.parentNode.insertBefore(wrapper, preElement);
                wrapper.appendChild(header);
                wrapper.appendChild(preElement);
            });
        };

        addCopyButtons(editorRoot);

        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        addCopyButtons(node);
                    }
                });
            }
        });

        observer.observe(editorRoot, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [view, isLoading, selectedDoc, isDarkMode, isEditing]);

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
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Title level={2} style={{ marginBottom: '1rem' }}>
                                {selectedDoc}
                            </Title>
                            <Button type="primary" onClick={handleEditSave}>
                                {isEditing ? 'Save' : 'Edit'}
                            </Button>
                        </div>
                        <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <LexicalEditor 
                                key={selectedDoc}
                                markdown={markdown} 
                                setMarkdown={setMarkdown} 
                                isDarkMode={isDarkMode}
                                isEditing={isEditing}
                            />
                        </div>
                    </>
                );
            case 'image':
                return (
                    <>
                        <Title level={2} style={{ marginBottom: '1rem' }}>
                            {selectedDoc}
                        </Title>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                            <img src={fileContent} alt={selectedDoc} style={{ maxWidth: '100%', maxHeight: '100%' }} />
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


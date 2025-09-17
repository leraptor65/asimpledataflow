import React from 'react';
import {
    MDXEditor,
    headingsPlugin,
    listsPlugin,
    quotePlugin,
    thematicBreakPlugin,
    toolbarPlugin,
    UndoRedo,
    BoldItalicUnderlineToggles,
    linkPlugin,
    linkDialogPlugin,
    imagePlugin,
    tablePlugin,
    frontmatterPlugin,
    codeBlockPlugin,
    codeMirrorPlugin,
    diffSourcePlugin,
    markdownShortcutPlugin,
    ListsToggle,
    CreateLink,
    InsertImage,
    InsertTable,
    InsertThematicBreak,
    InsertCodeBlock,
    ChangeCodeMirrorLanguage,
    ConditionalContents,
    Separator,
    BlockTypeSelect,
    DiffSourceToggleWrapper,
} from '@mdxeditor/editor';
import { Button, Typography } from 'antd';
import TableOfContents from './TableOfContents';
import TrashView from './TrashView';
import SettingsView from './SettingsView';
import * as api from '../api';


const { Title } = Typography;

const NoteEditor = ({ notes, isDarkMode }) => {

    const {
        view,
        selectedDoc,
        markdown,
        setMarkdown,
        editorRef,
        diffMarkdown,
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
        toggleTheme,
    } = notes;


    const imageUploadHandler = async (image) => {
        const formData = new FormData();
        formData.append('image', image);

        try {
            const response = await fetch(`/api/images`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Upload failed with status: ${response.status}, ${errorText}`);
            }

            const json = await response.json();
            return json.url;
        } catch (e) {
            alert(`Image upload failed: ${e.message}`);
            throw e;
        }
    };


    const renderMainContent = () => {
        switch (view) {
            case 'document':
                return (
                    <>
                        <Title level={2} style={{ marginBottom: '1rem' }}>
                            {selectedDoc}
                        </Title>
                        <div style={{ flex: '1 1 auto', overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: '2px', backgroundColor: '#fff', display: 'flex', flexDirection: 'column' }}>
                            <MDXEditor
                                key={selectedDoc}
                                markdown={markdown}
                                onChange={setMarkdown}
                                ref={editorRef}
                                className={isDarkMode ? 'dark-editor' : ''}
                                contentEditableClassName="prose"
                                plugins={[
                                    toolbarPlugin({
                                        toolbarContents: () => (
                                            <DiffSourceToggleWrapper>
                                                <ConditionalContents
                                                    options={[
                                                        {
                                                            when: (editor) => editor?.editorType === 'codeblock',
                                                            contents: () => <ChangeCodeMirrorLanguage />

                                                        },
                                                        {
                                                            fallback: () => (
                                                                <>
                                                                    <UndoRedo />
                                                                    <Separator />
                                                                    <BoldItalicUnderlineToggles />
                                                                    <Separator />
                                                                    <ListsToggle />
                                                                    <Separator />
                                                                    <BlockTypeSelect />
                                                                    <Separator />
                                                                    <CreateLink />
                                                                    <InsertImage />
                                                                    <InsertTable />
                                                                    <InsertThematicBreak />
                                                                    <Separator />
                                                                    <InsertCodeBlock />
                                                                </>
                                                            )
                                                        }
                                                    ]}
                                                />
                                            </DiffSourceToggleWrapper>
                                        )
                                    }),
                                    headingsPlugin(),
                                    listsPlugin(),
                                    quotePlugin(),
                                    thematicBreakPlugin(),
                                    linkPlugin(),
                                    linkDialogPlugin(),
                                    imagePlugin({ imageUploadHandler }),
                                    tablePlugin(),
                                    frontmatterPlugin(),
                                    codeBlockPlugin({ defaultCodeBlockLanguage: 'txt' }),
                                    codeMirrorPlugin({
                                        codeBlockLanguages: {
                                            js: 'JavaScript',
                                            css: 'CSS',
                                            txt: 'text',
                                            tsx: 'TypeScript',
                                            bash: 'Bash',
                                            powershell: 'PowerShell',
                                            python: 'Python',
                                            html: 'HTML',
                                        }
                                    }),
                                    diffSourcePlugin({ diffMarkdown: diffMarkdown, viewMode: 'rich-text' }),
                                    markdownShortcutPlugin()
                                ]}
                            />
                        </div>
                        <Button type="primary" onClick={saveDoc} style={{ alignSelf: 'flex-end', marginTop: '1rem' }}>
                            Save Document
                        </Button>
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
                    title={selectedFolder.name}
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
                return <SettingsView onImport={importFile} onExportAll={exportAll} fileInputRef={fileInputRef} toggleTheme={toggleTheme} isDarkMode={isDarkMode} />;
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
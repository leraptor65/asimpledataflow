"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Edit3, Columns, BookOpen, Copy, History, X, RotateCcw, AlertTriangle, Undo2, Share2, Printer, Link2, ArrowUpRight, Download } from "lucide-react";
import { loader } from "@monaco-editor/react";

// Self-host Monaco Editor: dynamically import to avoid SSR window errors
if (typeof window !== "undefined") {
    import("monaco-editor").then((monaco) => {
        loader.config({ monaco });
    });
}

import Editor, { DiffEditor } from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "highlight.js/styles/github-dark.css";
import hljs from "highlight.js/lib/common";
import "katex/dist/katex.min.css";
import EditorToolbar from "./EditorToolbar";

interface SplitEditorProps {
    note: any | null;
    onSave: (originalFilename: string, newFilename: string, content: string) => void;
    onDirtyChange?: (dirty: boolean) => void;
    onSelectNote?: (filename: string | null) => void;
    onSaveViewOnly?: (name: string, content: string) => void;
}

const PreCode = ({ children, ...props }: any) => {
    const preRef = useRef<HTMLPreElement>(null);
    const [copied, setCopied] = useState(false);

    let language = "";
    if (children && children.props && children.props.className) {
        const match = /language-(\w+)/.exec(children.props.className);
        if (match) language = match[1];
    }

    const handleCopy = () => {
        if (preRef.current) {
            const text = preRef.current.innerText;
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="relative group rounded-md overflow-hidden border border-border my-4 bg-muted">
            <div className="flex items-center justify-between px-4 py-1.5 bg-background/80 border-b border-border text-xs font-mono text-muted-foreground">
                <span>{language || "text"}</span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 hover:text-foreground transition opacity-0 group-hover:opacity-100"
                >
                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    {copied ? "Copied!" : "Copy"}
                </button>
            </div>
            <pre ref={preRef} className="p-4 overflow-x-auto text-sm m-0" {...props}>
                {children}
            </pre>
        </div>
    );
};

// Convert [[Wiki Link]] syntax to markdown links using /notes/ paths
function processWikiLinks(text: string): string {
    return text.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
        const filename = name.endsWith('.md') ? name : `${name}.md`;
        return `[${name}](/notes/${encodeURIComponent(filename)})`;
    });
}

export default function SplitEditor({ note, onSave, onDirtyChange, onSelectNote, onSaveViewOnly }: SplitEditorProps) {
    const [content, setContent] = useState("");
    const [originalContent, setOriginalContent] = useState("");
    const [isDirty, setIsDirty] = useState(false);
    const [filenameInput, setFilenameInput] = useState("");
    const [isSaved, setIsSaved] = useState(false);
    const [viewMode, setViewMode] = useState<"editor" | "split" | "render">("render");
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<any[]>([]);

    // On mobile, fallback from split to render
    useEffect(() => {
        const checkWidth = () => {
            if (window.innerWidth < 768 && viewMode === "split") {
                setViewMode("render");
            }
        };
        checkWidth();
        window.addEventListener("resize", checkWidth);
        return () => window.removeEventListener("resize", checkWidth);
    }, [viewMode]);

    // Diff & Revert State
    const [diffMode, setDiffMode] = useState(false);
    const [historicalContent, setHistoricalContent] = useState("");
    const [previewHash, setPreviewHash] = useState("");
    const [undoHash, setUndoHash] = useState("");
    const [showUndo, setShowUndo] = useState(false);

    // Sync State
    const [syncDiffMode, setSyncDiffMode] = useState(false);
    const [latestLocalContent, setLatestLocalContent] = useState("");

    const editorRef = useRef<any>(null);
    const shareRef = useRef<HTMLDivElement>(null);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [shareUrl, setShareUrl] = useState("");
    const [shareCopied, setShareCopied] = useState(false);
    const [expiresIn, setExpiresIn] = useState("24h");
    const [backlinks, setBacklinks] = useState<any[]>([]);
    const [showBacklinks, setShowBacklinks] = useState(true);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (shareRef.current && !shareRef.current.contains(event.target as Node)) {
                setIsShareOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Fetch backlinks for this note
    useEffect(() => {
        if (!note || !note.filename) { setBacklinks([]); return; }
        const fetchBacklinks = async () => {
            try {
                const res = await fetch(`/api/backlinks?file=${encodeURIComponent(note.filename)}`);
                if (res.ok) {
                    const data = await res.json();
                    setBacklinks(data || []);
                }
            } catch (e) { console.error(e); }
        };
        fetchBacklinks();
    }, [note]);

    const handleGenerateLink = async () => {
        if (!note || !note.filename) return;
        try {
            const res = await fetch("/api/share", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: note.filename, expires_in: expiresIn }),
            });
            if (res.ok) {
                const data = await res.json();
                const url = `${window.location.origin}/share/${data.token}`;
                setShareUrl(url);
                navigator.clipboard.writeText(url);
                setShareCopied(true);
                setTimeout(() => setShareCopied(false), 3000);
            }
        } catch (e) {
            console.error("Failed to generate share link", e);
        }
    };

    const handleDownloadMarkdown = () => {
        if (!note || !note.filename) return;

        let baseName = note.filename.split('/').pop() || note.filename;
        try {
            baseName = decodeURIComponent(baseName);
        } catch (e) {
            console.error("Failed to decode filename for download", e);
        }

        const downloadName = baseName.endsWith(".md") ? baseName : `${baseName}.md`;
        const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setIsShareOpen(false);
    };

    const fetchHistory = async () => {
        if (!note || !note.filename) return;
        try {
            const res = await fetch(`/api/history?file=${encodeURIComponent(note.filename)}`);
            const data = await res.json();
            setHistory(data || []);
            setShowHistory(true);
        } catch (e) {
            console.error(e);
        }
    };

    const handlePreviewRevert = async (hash: string) => {
        try {
            const res = await fetch(`/api/history/content?file=${encodeURIComponent(note.filename)}&hash=${hash}`);
            if (res.ok) {
                const text = await res.text();
                setHistoricalContent(text);
                setPreviewHash(hash);
                if (history.length > 0) setUndoHash(history[0].hash); // Save current latest prior to revert
                setShowHistory(false);
                setDiffMode(true);
            }
        } catch (e) {
            console.error("Failed to fetch historical content", e);
        }
    };

    const confirmRevert = async () => {
        try {
            const res = await fetch("/api/revert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hash: previewHash, filename: note.filename })
            });
            if (res.ok) {
                setDiffMode(false);
                setContent(historicalContent); // Update local state immediately
                setShowUndo(true);
                setTimeout(() => setShowUndo(false), 8000); // Allow undo for 8 seconds
            }
        } catch (e) {
            console.error(e);
        }
    };

    const cancelRevert = () => {
        setDiffMode(false);
        setHistoricalContent("");
        setPreviewHash("");
    };

    const handleUndo = async () => {
        if (!undoHash) return;
        try {
            const res = await fetch("/api/revert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hash: undoHash, filename: note.filename })
            });
            if (res.ok) {
                // To visually revert back, we'd need to fetch the content of undoHash or rely on reload.
                // Assuming standard reload flow.
                alert("Undo successful. Please reload the note.");
                setShowUndo(false);
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (note) {
            setContent(note.content || "");
            setOriginalContent(note.content || "");
            setFilenameInput((note.filename || "").replace(/\.md$/, ""));
            setIsDirty(false);
            setShareUrl("");
            setShareCopied(false);
            setExpiresIn("24h");
        } else {
            setContent("");
            setOriginalContent("");
            setFilenameInput("");
            setIsDirty(false);
            setShareUrl("");
            setShareCopied(false);
        }
    }, [note]);

    useEffect(() => {
        const dirty = content !== originalContent;
        setIsDirty(dirty);
        if (onDirtyChange) onDirtyChange(dirty);
    }, [content, originalContent, onDirtyChange]);

    const handleEditorChange = (value: string | undefined) => {
        setContent(value || "");
    };

    const handleEditorMount = (editor: any) => {
        editorRef.current = editor;
        editor.onDidPaste(async (e: any) => {
            // Very basic rudimentary paste handling for the browser clipboard via standard events later
            // The monaco built-in onDidPaste doesn't easily expose the clipboard data image directly,
            // so we rely on the standard dom paste event on the container.
        });
    };

    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            if (!e.clipboardData || !e.clipboardData.items) return;
            for (let i = 0; i < e.clipboardData.items.length; i++) {
                const item = e.clipboardData.items[i];
                if (item.type.indexOf("image") !== -1) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (!file) continue;

                    // Upload to Go backend
                    const formData = new FormData();
                    formData.append("image", file, file.name || `pasted_image_${Date.now()}.png`);

                    try {
                        const res = await fetch("/api/upload", {
                            method: "POST",
                            body: formData,
                        });
                        if (res.ok) {
                            const data = await res.json();
                            // Insert markdown image into content
                            const insertText = `\n![image](${data.url})\n`;
                            setContent((prev: string) => prev + insertText);
                        }
                    } catch (err) {
                        console.error("Upload failed", err);
                    }
                }
            }
        };

        document.addEventListener("paste", handlePaste);
        return () => document.removeEventListener("paste", handlePaste);
    }, []);

    const handleSyncClick = async () => {
        if (!note || !note.filename) return;
        try {
            const res = await fetch(`/api/notes/${encodeURIComponent(note.filename)}`);
            if (res.ok) {
                const data = await res.json();
                const latest = data.content || "";
                if (latest !== content) {
                    setLatestLocalContent(latest);
                    setSyncDiffMode(true);
                } else {
                    executeSync(latest);
                }
            } else if (res.status === 404) {
                executeSync("");
            }
        } catch (e) { console.error(e) }
    };

    const executeSync = (currentLatest: string) => {
        const finalFilename = filenameInput.endsWith(".md") ? filenameInput : `${filenameInput}.md`;
        onSave(note.filename, finalFilename || note.filename, content);
        setIsSaved(true);
        setSyncDiffMode(false);
        setOriginalContent(content);
        setIsDirty(false);
        setTimeout(() => setIsSaved(false), 2000);
    };

    const isDirtyRef = useRef(isDirty);
    const syncDiffModeRef = useRef(syncDiffMode);
    useEffect(() => {
        isDirtyRef.current = isDirty;
        syncDiffModeRef.current = syncDiffMode;
    }, [isDirty, syncDiffMode]);

    useEffect(() => {
        const intervalStr = localStorage.getItem("asdf_auto_sync_interval") || "0";
        const intervalMs = parseInt(intervalStr, 10);
        if (intervalMs > 0) {
            const timer = setInterval(() => {
                if (isDirtyRef.current && !syncDiffModeRef.current) {
                    document.getElementById("sync-button")?.click();
                }
            }, intervalMs);
            return () => clearInterval(timer);
        }
    }, []);

    const handleInsert = (prefix: string, suffix: string = "", defaultText: string = "") => {
        const editor = editorRef.current;
        if (!editor) return;

        const selection = editor.getSelection();
        const model = editor.getModel();
        if (!selection || !model) return;

        const textToWrap = model.getValueInRange(selection) || defaultText;
        const insertText = `${prefix}${textToWrap}${suffix}`;

        editor.executeEdits("toolbar", [
            {
                range: selection,
                text: insertText,
                forceMoveMarkers: true,
            },
        ]);
        editor.focus();
    };

    if (!note) {
        return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Select a note or create a new one to start editing
            </div>
        );
    }

    return (
        <div className="relative flex-1 flex flex-col h-full overflow-hidden">
            {note.isViewOnly && (
                <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between text-xs md:text-sm text-primary font-medium z-10 shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">View-Only</span>
                        <span>This file is loaded in memory and NOT saved in your vault.</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => onSaveViewOnly?.(note.filename, content)}
                            className="bg-primary text-primary-foreground hover:opacity-90 px-3 py-1 rounded text-xs font-semibold transition shadow-sm"
                        >
                            Save to Vault
                        </button>
                        <button
                            onClick={() => onSelectNote?.(null)}
                            className="hover:bg-muted p-1 rounded transition text-muted-foreground hover:text-foreground"
                            title="Close and wipe from memory"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 md:p-4 border-b border-border bg-background">
                <div className="text-lg md:text-xl font-semibold px-2 min-w-0 flex-1 md:flex-none md:w-1/2 truncate text-foreground">
                    {filenameInput}
                </div>
                <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                    <div className="flex bg-muted rounded-md p-1 mr-2 md:mr-4">
                        <button
                            onClick={() => setViewMode("editor")}
                            className={`p-1.5 rounded-sm transition ${viewMode === "editor" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            title="Editor Only"
                        >
                            <Edit3 size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode("split")}
                            className={`p-1.5 rounded-sm transition hidden md:block ${viewMode === "split" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            title="Split View"
                        >
                            <Columns size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode("render")}
                            className={`p-1.5 rounded-sm transition ${viewMode === "render" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            title="Rendered Only"
                        >
                            <BookOpen size={16} />
                        </button>
                    </div>

                    <button
                        onClick={fetchHistory}
                        className="flex items-center justify-center w-9 h-9 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                        title="Version History"
                    >
                        <History size={16} />
                    </button>

                    {isSaved && !diffMode && !showUndo && (
                        <span className="text-sm text-green-500 font-medium flex items-center gap-1 transition-opacity duration-300">
                            <Check size={16} /> Saved
                        </span>
                    )}

                    {showUndo && (
                        <button
                            onClick={handleUndo}
                            className="bg-secondary text-secondary-foreground text-sm px-3 py-1.5 rounded shadow hover:bg-secondary/80 transition flex items-center gap-1.5"
                        >
                            <Undo2 size={16} /> Undo Revert
                        </button>
                    )}

                    {diffMode || syncDiffMode ? (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={diffMode ? cancelRevert : () => setSyncDiffMode(false)}
                                className="bg-secondary text-secondary-foreground px-3 md:px-4 py-2 rounded shadow hover:bg-secondary/80 transition text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={diffMode ? confirmRevert : () => executeSync(latestLocalContent)}
                                className={diffMode ? "bg-destructive text-destructive-foreground px-3 md:px-4 py-2 rounded shadow hover:opacity-90 transition flex items-center gap-2 text-sm" : "bg-primary text-primary-foreground px-3 md:px-4 py-2 rounded shadow hover:opacity-90 transition flex items-center gap-2 text-sm"}
                            >
                                {diffMode ? <><AlertTriangle size={16} /> Confirm Revert</> : "Confirm Sync"}
                            </button>
                        </div>
                    ) : !note.isViewOnly ? (
                        <div className="flex items-center gap-2">
                            <div className="relative flex items-center shrink-0" ref={shareRef}>
                                <button
                                    onClick={() => setIsShareOpen(!isShareOpen)}
                                    className="flex items-center justify-center w-9 h-9 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                                    title="Share / Print"
                                >
                                    <Share2 size={16} />
                                </button>
                                {isShareOpen && (
                                    <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-popover border border-border rounded-md shadow-md py-1 text-popover-foreground flex flex-col font-medium">
                                        <div className="px-4 py-2 flex flex-col gap-1.5 border-b border-border">
                                            <label className="text-xs text-muted-foreground font-semibold uppercase">Link Expiration</label>
                                            <select
                                                value={expiresIn}
                                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setExpiresIn(e.target.value)}
                                                className="w-full bg-background border border-input rounded px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                            >
                                                <option value="1h">1 Hour</option>
                                                <option value="12h">12 Hours</option>
                                                <option value="24h">1 Day</option>
                                                <option value="3d">3 Days</option>
                                                <option value="7d">1 Week</option>
                                                <option value="14d">2 Weeks</option>
                                                <option value="30d">1 Month</option>
                                                <option value="never">Never</option>
                                            </select>
                                        </div>
                                        <button
                                            onClick={handleGenerateLink}
                                            className="flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted transition-colors text-sm"
                                        >
                                            <Link2 size={16} className="text-muted-foreground" />
                                            {shareCopied ? "Link Copied!" : "Generate Link"}
                                        </button>
                                        {shareUrl && (
                                            <div className="px-4 py-2 border-t border-border">
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="text"
                                                        readOnly
                                                        value={shareUrl}
                                                        className="flex-1 text-xs bg-muted border border-border rounded px-2 py-1 text-muted-foreground truncate"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(shareUrl);
                                                            setShareCopied(true);
                                                            setTimeout(() => setShareCopied(false), 3000);
                                                        }}
                                                        className="p-1 hover:bg-muted rounded transition"
                                                        title="Copy Link"
                                                    >
                                                        <Copy size={14} className="text-muted-foreground" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        <button
                                            onClick={() => {
                                                setIsShareOpen(false);
                                                window.print();
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 text-left hover:bg-muted transition-colors text-sm border-t border-border"
                                        >
                                            <Printer size={16} className="text-muted-foreground" />
                                            Print
                                        </button>
                                        <button
                                            onClick={handleDownloadMarkdown}
                                            className="flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted transition-colors text-sm border-t border-border"
                                        >
                                            <Download size={16} className="text-muted-foreground" />
                                            Download
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button
                                id="sync-button"
                                onClick={handleSyncClick}
                                className={`px-3 md:px-4 py-2 rounded shadow transition text-sm ${isDirty ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-primary text-primary-foreground hover:opacity-90"}`}
                            >
                                {isDirty ? "Sync" : "Sync"}
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
            <div className="flex-1 flex overflow-hidden">
                {diffMode || syncDiffMode ? (
                    <div className="w-full h-full flex flex-col">
                        <div className="bg-muted text-muted-foreground text-xs py-1 px-4 border-b border-border flex justify-between">
                            <span>{diffMode ? `Original (Commit: ${previewHash.substring(0, 7)})` : "Local File (Disk)"}</span>
                            <span>{diffMode ? "Current (Modified)" : "Current Draft (Editable)"}</span>
                        </div>
                        <DiffEditor
                            height="100%"
                            language="markdown"
                            theme="vs-dark"
                            original={diffMode ? historicalContent : latestLocalContent}
                            modified={content}
                            onMount={syncDiffMode ? ((editor) => {
                                const modifiedEditor = editor.getModifiedEditor();
                                modifiedEditor.onDidChangeModelContent(() => {
                                    setContent(modifiedEditor.getValue());
                                });
                            }) : undefined}
                            options={{
                                renderSideBySide: true,
                                readOnly: !syncDiffMode,
                                originalEditable: false,
                                minimap: { enabled: false },
                                wordWrap: "on",
                            }}
                        />
                    </div>
                ) : (
                    <>
                        {/* Monaco Editor (Left Pane) */}
                        {viewMode !== "render" && (
                            <div className={`${viewMode === "editor" ? "w-full" : "w-1/2 border-r"} border-border h-full flex flex-col`}>
                                {!note.isViewOnly && <EditorToolbar onInsert={handleInsert} />}
                                <div className="flex-1">
                                    <Editor
                                        height="100%"
                                        defaultLanguage="markdown"
                                        theme="vs-dark"
                                        value={content}
                                        onChange={handleEditorChange}
                                        onMount={handleEditorMount}
                                        options={{
                                            minimap: { enabled: false },
                                            wordWrap: "on",
                                            padding: { top: 16 },
                                            fontSize: 14,
                                            lineNumbers: "on",
                                            readOnly: note.isViewOnly,
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Markdown Preview (Right Pane) */}
                        {viewMode !== "editor" && (
                            <div className={`${viewMode === "render" ? "w-full" : "w-1/2"} h-full overflow-y-auto p-8 bg-background`}>
                                <div className="prose prose-invert max-w-none">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                                        rehypePlugins={[[rehypeHighlight, { detect: true }], rehypeKatex]}
                                        components={{
                                            pre: PreCode,
                                            a: ({ href, children }: any) => {
                                                if (href?.startsWith('/notes/')) {
                                                    return (
                                                        <span
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                const filename = decodeURIComponent(href.replace('/notes/', ''));
                                                                onSelectNote?.(filename);
                                                            }}
                                                            className="text-primary hover:underline cursor-pointer"
                                                            role="link"
                                                            tabIndex={0}
                                                        >
                                                            {children}
                                                        </span>
                                                    );
                                                }
                                                return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                                            }
                                        }}
                                    >
                                        {processWikiLinks(content) || "*Empty note*"}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Backlinks Panel */}
            {backlinks.length > 0 && showBacklinks && !diffMode && !syncDiffMode && (
                <div className="border-t border-border bg-muted/30">
                    <button
                        onClick={() => setShowBacklinks(!showBacklinks)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition"
                    >
                        <ArrowUpRight size={14} />
                        {backlinks.length} Backlink{backlinks.length !== 1 ? 's' : ''}
                    </button>
                    <div className="px-4 pb-3 flex flex-wrap gap-2">
                        {backlinks.map((bl: any) => (
                            <button
                                key={bl.filename}
                                onClick={() => onSelectNote?.(bl.filename)}
                                className="text-xs bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20 transition"
                            >
                                {(bl.filename || "").replace(/\.md$/, "")}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {showHistory && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-50">
                    <div className="bg-card w-full max-w-2xl max-h-[80vh] rounded-lg border border-border flex flex-col shadow-xl">
                        <div className="p-4 border-b border-border flex justify-between items-center">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <History size={20} /> Version History
                            </h2>
                            <button onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
                            {history.length === 0 ? (
                                <p className="text-muted-foreground text-center py-8">No history found</p>
                            ) : (
                                history.map((c: any) => (
                                    <div key={c.hash} className="flex flex-col gap-2 p-3 rounded-md border border-border bg-muted/30">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="font-mono text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded mr-2">
                                                    {c.hash.substring(0, 7)}
                                                </span>
                                                <span className="text-sm font-medium">{c.message}</span>
                                            </div>
                                            <button
                                                onClick={() => handlePreviewRevert(c.hash)}
                                                className="flex items-center gap-1 text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground px-2 py-1 rounded shadow-sm border border-border transition"
                                            >
                                                <RotateCcw size={12} /> Preview Revert
                                            </button>
                                        </div>
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>{c.author}</span>
                                            <span>{new Date(c.date).toLocaleString()}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

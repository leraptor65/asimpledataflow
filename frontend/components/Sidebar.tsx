"use client";

import { FileText, Plus, Search, Settings, Folder, FolderOpen, ChevronRight, ChevronDown, FolderPlus, Trash2, ArchiveRestore, X, MoreVertical, AlertCircle, ChevronsDown, ChevronsUp } from "lucide-react";
import { useState, useEffect } from "react";

interface TreeItem {
    name: string;
    path: string;
    type: string;
    lastModified?: string;
    children?: TreeItem[];
}

interface SidebarProps {
    notes: any[];
    treeData: TreeItem[];
    onSelectNote: (note: any) => void;
    onCreateNote: () => void;
    onSearch: (query: string) => void;
    onOpenSettings: () => void;
    onRefreshTree: () => void;
    showRecycleBin: boolean;
    onOpenRecycleBin: () => void;
    onCloseRecycleBin: () => void;
    conflictedNote?: string | null;
}

function TreeNode({
    item,
    level,
    onSelect,
    onRefresh,
    expandSignal,
    collapseSignal,
    conflictedNote,
    onInitMove
}: {
    item: TreeItem,
    level: number,
    onSelect: (note: any) => void,
    onRefresh: () => void,
    expandSignal: number,
    collapseSignal: number,
    conflictedNote?: string | null,
    onInitMove: (item: TreeItem) => void
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        if (expandSignal > 0) setIsOpen(true);
    }, [expandSignal]);

    useEffect(() => {
        if (collapseSignal > 0) setIsOpen(false);
    }, [collapseSignal]);

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        if (!confirm(`Are you sure you want to move ${item.name} to the recycle bin?`)) return;
        try {
            await fetch("/api/delete", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: item.path })
            });
            setTimeout(() => onRefresh(), 500);
        } catch (err) {
            console.error(err);
        }
    };

    const handleRename = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        const isFile = item.type === "file";
        const currentName = isFile ? item.name.replace(".md", "") : item.name;
        const newName = prompt("Enter new name:", currentName);
        if (!newName || newName === currentName) return;

        const srcPath = item.path;
        const parentPath = item.path.split('/').slice(0, -1).join('/');
        const cleanNewName = isFile && !newName.endsWith(".md") ? `${newName}.md` : newName;
        const destPath = parentPath ? `${parentPath}/${cleanNewName}` : cleanNewName;

        try {
            await fetch("/api/move", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source: srcPath, destination: destPath })
            });
            setTimeout(() => onRefresh(), 500);
        } catch (err) { console.error(err) }
    };

    const handleMoveExplicit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        onInitMove(item);
    };

    const handleNewNestedFolder = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        const folderName = prompt("Enter new nested folder name:");
        if (!folderName) return;
        try {
            await fetch("/api/folders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: `${item.path}/${folderName}` })
            });
            setIsOpen(true);
            setTimeout(() => onRefresh(), 500);
        } catch (err) { console.error(err) }
    };

    const handleNewNestedNote = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        const noteName = prompt("Enter new note name:");
        if (!noteName) return;
        const cleanName = noteName.endsWith(".md") ? noteName : `${noteName}.md`;
        const filename = `${item.path}/${cleanName}`;
        onSelect({
            filename,
            title: noteName.replace(".md", ""),
            content: `# ${noteName.replace(".md", "")}\n\nStart typing here...`
        });
        setIsOpen(true);
    };

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData("text/plain", item.path);
        e.stopPropagation();
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const srcPath = e.dataTransfer.getData("text/plain");
        if (!srcPath || srcPath === item.path) return;

        // Dest is this folder, or parent folder if this is a file
        const destDir = item.type === "folder" ? item.path : item.path.split('/').slice(0, -1).join('/');
        const srcName = srcPath.split('/').pop();
        const finalDest = destDir ? `${destDir}/${srcName}` : srcName;

        if (srcPath === finalDest) return;

        try {
            await fetch("/api/move", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source: srcPath, destination: finalDest })
            });
            setTimeout(() => onRefresh(), 500); // give backend fs time to process
        } catch (e) {
            console.error(e);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const dropProps = {
        onDrop: handleDrop,
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
    };

    if (item.type === "folder") {
        return (
            <div {...dropProps}>
                <div className={`w-full group flex items-center justify-between transition text-sm text-foreground pr-4 ${isDragOver ? "bg-primary/20" : "hover:bg-muted/50"}`} style={{ paddingLeft: `${level * 16 + 16}px` }}>
                    <button
                        draggable
                        onDragStart={handleDragStart}
                        onClick={() => setIsOpen(!isOpen)}
                        className="flex-1 text-left flex items-start gap-1.5 py-1.5"
                    >
                        {isOpen ? <ChevronDown size={14} className="opacity-70 shrink-0 mt-0.5" /> : <ChevronRight size={14} className="opacity-70 shrink-0 mt-0.5" />}
                        {isOpen ? <FolderOpen size={16} className="text-secondary-foreground shrink-0 mt-0.5" /> : <Folder size={16} className="text-secondary-foreground shrink-0 mt-0.5" />}
                        <span className="break-words leading-tight flex-1">{item.name}</span>
                    </button>
                    <div className="relative flex items-center shrink-0">
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
                            className={`p-1 hover:text-foreground transition-colors ${isMenuOpen ? "opacity-100 text-foreground" : "opacity-0 group-hover:opacity-100"}`}
                        >
                            <MoreVertical size={14} />
                        </button>

                        {isMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); }} />
                                <div className="absolute right-0 top-full mt-1 z-50 w-36 bg-popover border border-border rounded-md shadow-md py-1 text-popover-foreground flex flex-col text-xs font-medium">
                                    <button onClick={handleNewNestedNote} className="px-3 py-1.5 text-left hover:bg-muted transition-colors">New Note Here</button>
                                    <button onClick={handleNewNestedFolder} className="px-3 py-1.5 text-left hover:bg-muted transition-colors">New Folder Here</button>
                                    <div className="h-px bg-border my-1" />
                                    <button onClick={handleRename} className="px-3 py-1.5 text-left hover:bg-muted transition-colors">Rename</button>
                                    <button onClick={handleMoveExplicit} className="px-3 py-1.5 text-left hover:bg-muted transition-colors">Move To...</button>
                                    <button onClick={handleDelete} className="px-3 py-1.5 text-left text-destructive hover:bg-destructive/10 transition-colors">Delete</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                {isOpen && item.children && item.children.length > 0 && (
                    <div>
                        {item.children.map((child) =>
                            <TreeNode
                                key={child.path}
                                item={child}
                                level={level + 1}
                                onSelect={onSelect}
                                onRefresh={onRefresh}
                                expandSignal={expandSignal}
                                collapseSignal={collapseSignal}
                                conflictedNote={conflictedNote}
                                onInitMove={onInitMove}
                            />
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div {...dropProps} className={`group w-full flex items-center justify-between transition text-sm text-muted-foreground pr-4 ${isDragOver ? "bg-primary/20" : "hover:bg-muted/50"}`} style={{ paddingLeft: `${level * 16 + 16 + 18}px` }}>
            <button
                draggable
                onDragStart={handleDragStart}
                onClick={() => onSelect(item.path)}
                className="flex-1 text-left flex items-start gap-1.5 py-1.5"
            >
                {conflictedNote === item.path ? (
                    <span title="Unsynced changes conflict with external modifications" className="shrink-0 flex items-center mt-0.5">
                        <AlertCircle size={16} className="text-amber-500" />
                    </span>
                ) : (
                    <FileText size={16} className="shrink-0 opacity-70 mt-0.5" />
                )}
                <span className="break-words leading-tight flex-1">{item.name.replace(".md", "")}</span>
            </button>
            <div className="relative flex items-center shrink-0">
                <button
                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
                    className={`p-1 hover:text-foreground transition-colors ${isMenuOpen ? "opacity-100 text-foreground" : "opacity-0 group-hover:opacity-100"}`}
                >
                    <MoreVertical size={14} />
                </button>

                {isMenuOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); }} />
                        <div className="absolute right-0 top-full mt-1 z-50 w-36 bg-popover border border-border rounded-md shadow-md py-1 text-popover-foreground flex flex-col text-xs font-medium">
                            <button onClick={handleRename} className="px-3 py-1.5 text-left hover:bg-muted transition-colors">Rename</button>
                            <button onClick={handleMoveExplicit} className="px-3 py-1.5 text-left hover:bg-muted transition-colors">Move To...</button>
                            <div className="h-px bg-border my-1" />
                            <button onClick={handleDelete} className="px-3 py-1.5 text-left text-destructive hover:bg-destructive/10 transition-colors">Delete</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function MoveModal({
    itemToMove,
    treeData,
    onClose,
    onMove
}: {
    itemToMove: TreeItem,
    treeData: TreeItem[],
    onClose: () => void,
    onMove: (destFolder: string) => void
}) {
    const renderFolder = (node: TreeItem, level: number) => {
        if (node.type !== "folder") return null;
        if (node.path === itemToMove.path) return null; // Can't move into itself or its children ideally, but good enough for now

        return (
            <div key={node.path}>
                <button
                    onClick={() => onMove(node.path)}
                    className="w-full text-left px-4 py-2 hover:bg-muted transition flex items-center gap-2 text-sm"
                    style={{ paddingLeft: `${level * 16 + 16}px` }}
                >
                    <Folder size={16} className="text-secondary-foreground" />
                    <span className="truncate">{node.name}</span>
                </button>
                {node.children && node.children.map(child => renderFolder(child, level + 1))}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] bg-background/80 flex items-center justify-center p-4">
            <div className="bg-popover border border-border shadow-lg rounded-md p-4 w-full max-w-md flex flex-col max-h-[80vh]">
                <h2 className="font-bold text-lg mb-4 text-popover-foreground truncate">Move '{itemToMove.name}' To...</h2>
                <div className="flex-1 overflow-y-auto border border-border rounded-md py-2 bg-background">
                    <button
                        onClick={() => onMove("")}
                        className="w-full text-left px-4 py-2 hover:bg-muted transition flex items-center gap-2 text-sm font-medium"
                    >
                        <ArchiveRestore size={16} className="text-secondary-foreground" />
                        <span>Root Directory</span>
                    </button>
                    {treeData.map(node => renderFolder(node, 0))}
                </div>
                <div className="mt-4 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 hover:bg-muted rounded-md text-sm font-medium transition cursor-pointer">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function Sidebar({
    notes,
    treeData,
    onSelectNote,
    onCreateNote,
    onSearch,
    onOpenSettings,
    onRefreshTree,
    showRecycleBin,
    onOpenRecycleBin,
    onCloseRecycleBin,
    conflictedNote
}: SidebarProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [recycleItems, setRecycleItems] = useState<TreeItem[]>([]);

    // Sidebar Header State
    const [sortMode, setSortMode] = useState<"alpha-asc" | "alpha-desc" | "modified-desc">("alpha-asc");
    const [expandSignal, setExpandSignal] = useState(0);
    const [collapseSignal, setCollapseSignal] = useState(0);

    // Move Modal State
    const [itemToMove, setItemToMove] = useState<TreeItem | null>(null);

    const sortNodes = (nodes: TreeItem[]): TreeItem[] => {
        return [...nodes].sort((a, b) => {
            // Always sort folders first
            if (a.type === "folder" && b.type === "file") return -1;
            if (a.type === "file" && b.type === "folder") return 1;

            if (sortMode === "alpha-asc") return a.name.localeCompare(b.name);
            if (sortMode === "alpha-desc") return b.name.localeCompare(a.name);

            // modified-desc
            if (sortMode === "modified-desc") {
                const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
                const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
                return bTime - aTime;
            }
            return 0;
        }).map(node => ({
            ...node,
            children: node.children ? sortNodes(node.children) : []
        }));
    };

    const sortedTreeData = sortNodes(treeData);

    const fetchRecycleBin = async () => {
        try {
            const res = await fetch("/api/recycle-bin");
            const data = await res.json();
            setRecycleItems(data || []);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (showRecycleBin) {
            fetchRecycleBin();
        }
    }, [showRecycleBin]);

    const handleRestore = async (name: string) => {
        try {
            await fetch("/api/recycle-bin/restore", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name })
            });
            fetchRecycleBin();
            onRefreshTree();
        } catch (e) {
            console.error(e);
        }
    };

    const handlePermanentDelete = async (name: string) => {
        if (!confirm(`Are you sure you want to permanently delete '${name}'? This cannot be undone.`)) return;
        try {
            await fetch("/api/recycle-bin/permanent", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name })
            });
            fetchRecycleBin();
        } catch (e) {
            console.error(e);
        }
    };

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value;
        setSearchQuery(q);
        onSearch(q);
    };

    const handleCreateFolder = async () => {
        const folderName = prompt("Enter folder name:");
        if (!folderName) return;
        try {
            await fetch("/api/folders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: folderName })
            });
            setTimeout(() => onRefreshTree(), 500);
        } catch (e) {
            console.error(e);
        }
    };

    const handleExecuteMove = async (destFolder: string) => {
        if (!itemToMove) return;
        const destPath = destFolder ? `${destFolder}/${itemToMove.name}` : itemToMove.name;
        if (destPath === itemToMove.path) {
            setItemToMove(null);
            return;
        }

        try {
            await fetch("/api/move", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source: itemToMove.path, destination: destPath })
            });
            setItemToMove(null);
            setTimeout(() => onRefreshTree(), 500);
        } catch (err) { console.error(err) }
    };

    return (
        <div className="w-64 border-r border-border bg-muted/20 flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-border flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h1 className="font-bold text-lg">ASDF</h1>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleCreateFolder}
                            className="p-1 hover:bg-muted rounded text-foreground"
                            title="New Folder"
                        >
                            <FolderPlus size={18} />
                        </button>
                        <button
                            onClick={onCreateNote}
                            className="p-1 hover:bg-muted rounded text-foreground"
                            title="New Note"
                        >
                            <Plus size={20} />
                        </button>
                    </div>
                </div>

                <div className="relative w-full">
                    <Search className="absolute left-2 text-muted-foreground top-2.5 h-4 w-4" />
                    <input
                        type="text"
                        placeholder="Search notes..."
                        value={searchQuery}
                        onChange={handleSearch}
                        className="w-full bg-background border border-input rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <select
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value as any)}
                        className="bg-transparent border-none focus:ring-0 cursor-pointer hover:text-foreground py-1 px-0 appearance-none outline-none leading-none"
                    >
                        <option value="alpha-asc">A-Z</option>
                        <option value="alpha-desc">Z-A</option>
                        <option value="modified-desc">Last Modified</option>
                    </select>

                    <div className="flex gap-1">
                        <button onClick={() => setExpandSignal(s => s + 1)} className="hover:text-foreground p-1 hover:bg-muted rounded" title="Expand All"><ChevronsDown size={16} /></button>
                        <button onClick={() => setCollapseSignal(s => s + 1)} className="hover:text-foreground p-1 hover:bg-muted rounded" title="Collapse All"><ChevronsUp size={16} /></button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pb-24">
                {searchQuery ? (
                    notes.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                            No notes found.
                        </div>
                    ) : (
                        <ul className="py-2">
                            {notes.map((note) => (
                                <li key={note.filename}>
                                    <button
                                        onClick={() => onSelectNote(note.filename)}
                                        className={`w-full text-left px-4 py-2 flex items-start gap-2 hover:bg-muted/50 transition text-sm ${note.filename
                                            ? "bg-muted font-medium text-foreground"
                                            : "text-muted-foreground"
                                            }`}
                                    >
                                        {conflictedNote === note.filename ? (
                                            <span title="Unsynced changes conflict with external modifications" className="shrink-0 flex items-center mt-0.5">
                                                <AlertCircle size={16} className="text-amber-500" />
                                            </span>
                                        ) : (
                                            <FileText size={16} className="shrink-0 mt-0.5" />
                                        )}
                                        <span className="break-words leading-tight">{note.title || (note.filename || "").replace(".md", "")}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )
                ) : (
                    <div className="py-2">
                        {sortedTreeData.map((node) => (
                            <TreeNode
                                key={node.path}
                                item={node}
                                level={0}
                                onSelect={onSelectNote}
                                onRefresh={onRefreshTree}
                                expandSignal={expandSignal}
                                collapseSignal={collapseSignal}
                                conflictedNote={conflictedNote}
                                onInitMove={setItemToMove}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-border flex items-center justify-between">
                <button
                    onClick={onOpenSettings}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                    title="Settings"
                >
                    <Settings size={18} />
                    <span className="text-sm font-medium">Settings</span>
                </button>
                <div className="flex gap-1">
                    <button
                        onClick={onOpenRecycleBin}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                        title="Recycle Bin"
                    >
                        <ArchiveRestore size={16} />
                    </button>
                    <button
                        onClick={onRefreshTree}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                        title="Refresh Workspace"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                    </button>
                </div>
            </div>

            {showRecycleBin && (
                <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
                    <div className="bg-card w-full max-w-2xl max-h-[80vh] rounded-lg border border-border flex flex-col shadow-xl">
                        <div className="p-4 border-b border-border flex justify-between items-center">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
                                <Trash2 size={20} /> Recycle Bin
                            </h2>
                            <button onClick={onCloseRecycleBin} className="text-muted-foreground hover:text-foreground">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
                            {recycleItems.length === 0 ? (
                                <p className="text-muted-foreground text-center py-8">Recycle Bin is empty</p>
                            ) : (
                                recycleItems.map((item) => (
                                    <div key={item.path} className="flex justify-between items-center p-3 rounded-md border border-border bg-muted/30">
                                        <div className="flex items-center gap-3 truncate pr-4">
                                            {item.type === "folder" ? <Folder size={18} className="text-muted-foreground shrink-0" /> : <FileText size={18} className="text-muted-foreground shrink-0" />}
                                            <span className="truncate text-sm text-foreground">{item.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => handleRestore(item.name)}
                                                className="flex items-center gap-1.5 text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground px-3 py-1.5 rounded shadow-sm border border-border transition"
                                                title="Restore"
                                            >
                                                <ArchiveRestore size={14} /> Restore
                                            </button>
                                            <button
                                                onClick={() => handlePermanentDelete(item.name)}
                                                className="flex items-center gap-1.5 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground px-3 py-1.5 rounded shadow-sm transition"
                                                title="Delete Permanently"
                                            >
                                                <Trash2 size={14} /> Delete
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {itemToMove && (
                <MoveModal
                    itemToMove={itemToMove}
                    treeData={sortedTreeData}
                    onClose={() => setItemToMove(null)}
                    onMove={handleExecuteMove}
                />
            )}
        </div>
    );
}

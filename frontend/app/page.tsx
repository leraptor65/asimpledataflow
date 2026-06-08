"use client";

import React, { useEffect, useRef, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu, FileText, FolderPlus, BookOpen, Folder, ArchiveRestore, Upload, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import SplitEditor from "@/components/SplitEditor";
import CommandPalette from "@/components/CommandPalette";
import Settings from "@/components/Settings";

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();

  const [notes, setNotes] = useState<any[]>([]);
  const [treeData, setTreeData] = useState<any[]>([]);
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [currentView, setCurrentView] = useState<"editor" | "settings">("editor");

  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{ type: string, payload?: any } | null>(null);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Note Upload / Drag and Drop State
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importFile, setImportFile] = useState<{ name: string; content: string } | null>(null);
  const [saveFolderNoteData, setSaveFolderNoteData] = useState<{ name: string; content: string } | null>(null);
  const [showSaveFolderModal, setShowSaveFolderModal] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState("");

  const conflictedNote = (() => {
    if (!isEditorDirty || !selectedNote) return null;
    const dbNote = notes.find((n: any) => n.filename === selectedNote.filename);
    if (!dbNote) return null;
    if (dbNote.last_modified && selectedNote.last_modified && dbNote.last_modified !== selectedNote.last_modified) {
      return selectedNote.filename;
    }
    return null;
  })();

  const fetchTree = async () => {
    try {
      const res = await fetch("/api/tree");
      if (res.ok) {
        setTreeData(await res.json() || []);
      }
    } catch (e) { console.error(e) }
  };

  const fetchNotes = async (query: string = "") => {
    try {
      const url = query ? `/api/search?q=${encodeURIComponent(query)}` : "/api/notes";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setNotes(data || []);
      }
    } catch (e) {
      console.error("Failed to fetch notes", e);
    }
  };

  useEffect(() => {
    fetchNotes();
    fetchTree();
  }, []);

  // Listen to window-level dragenter / dragover to show the dropzone overlay
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
        setIsDraggingFile(true);
      }
    };

    window.addEventListener("dragover", handleDragOver);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
    };
  }, []);

  // Track selectedNote in a ref so the pathname effect always has the latest value
  const selectedNoteRef = useRef(selectedNote);
  useEffect(() => { selectedNoteRef.current = selectedNote; }, [selectedNote]);

  // Sync URL → selected note: when pathname changes, load the note
  useEffect(() => {
    if (pathname.startsWith("/notes/")) {
      const notePath = decodeURIComponent(pathname.replace("/notes/", ""));
      // Skip loading if we already have this note selected (covers newly created unsaved notes)
      const current = selectedNoteRef.current;
      if (current && current.filename === notePath) {
        setCurrentView("editor");
        return;
      }
      loadNote(notePath);
      setCurrentView("editor");
    }
  }, [pathname]);

  const loadNote = async (filename: string) => {
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(filename)}`);
      if (res.ok) {
        const fullNote = await res.json();
        setSelectedNote(fullNote);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectNote = async (noteOrFilename: any) => {
    if (noteOrFilename === null) {
      setSelectedNote(null);
      selectedNoteRef.current = null;
      window.history.pushState(null, '', '/');
      return;
    }
    const filename = typeof noteOrFilename === 'string' ? noteOrFilename : noteOrFilename.filename;
    // If we received a full note object (e.g. from "New Note Here"), set it directly
    // and use pushState to avoid component remount
    if (typeof noteOrFilename === 'object' && noteOrFilename.content !== undefined) {
      setSelectedNote(noteOrFilename);
      selectedNoteRef.current = noteOrFilename;
      setCurrentView("editor");
      window.history.pushState(null, '', `/notes/${encodeURIComponent(filename)}`);
      return;
    }
    // For existing notes, navigate via URL - the useEffect will handle loading
    router.push(`/notes/${encodeURIComponent(filename)}`);
  };

  const executePendingNavigation = () => {
    if (!pendingNavigation) return;
    const { type, payload } = pendingNavigation;
    setPendingNavigation(null);
    setIsEditorDirty(false);

    if (type === 'select') handleSelectNote(payload);
    else if (type === 'create') handleCreateNote();
    else if (type === 'settings') setCurrentView("settings");
    else if (type === 'recycle_bin') setShowRecycleBin(true);
  };

  const requestNavigation = (type: string, payload?: any) => {
    if (isEditorDirty) {
      setPendingNavigation({ type, payload });
    } else {
      if (type === 'select') handleSelectNote(payload);
      else if (type === 'create') handleCreateNote();
      else if (type === 'settings') setCurrentView("settings");
      else if (type === 'recycle_bin') setShowRecycleBin(true);
    }
  };

  const handleCreateNote = () => {
    const noteName = prompt("Enter new note name:");
    if (noteName === null) return; // user cancelled
    
    const cleanName = noteName.trim();
    if (!cleanName) {
      alert("Note name cannot be empty");
      return;
    }
    
    const filename = cleanName.endsWith(".md") ? cleanName : `${cleanName}.md`;
    const exists = notes.some((n: any) => n.filename.toLowerCase() === filename.toLowerCase());
    if (exists) {
      alert("A note with that name already exists");
      return;
    }
    
    const title = cleanName.replace(/\.md$/, "");
    const newNote = {
      filename,
      title,
      content: `# ${title}\n\nStart typing here...`,
    };
    setSelectedNote(newNote);
    selectedNoteRef.current = newNote;
    setCurrentView("editor");
    
    // Add the new note to the notes list immediately so it renders optimistically
    setNotes((prev: any[]) => [newNote, ...prev]);
    
    window.history.pushState(null, '', `/notes/${encodeURIComponent(filename)}`);
  };

  const handleRenameNote = (oldPath: string, newPath: string) => {
    fetchTree();
    fetchNotes();
    
    setSelectedNote((current: any) => {
      if (current && current.filename === oldPath) {
        const cleanName = newPath.split('/').pop()?.replace(/\.md$/, "") || newPath;
        const updated = {
          ...current,
          filename: newPath,
          title: cleanName,
        };
        selectedNoteRef.current = updated;
        window.history.pushState(null, '', `/notes/${encodeURIComponent(newPath)}`);
        return updated;
      }
      return current;
    });
  };

  const handleSaveNote = async (originalFilename: string, newFilename: string, content: string) => {
    try {
      // If the filename changed, and the original file existed on disk, move it first
      const isExistingNote = notes.some((n: any) => n.filename === originalFilename);
      if (isExistingNote && originalFilename && originalFilename !== newFilename) {
        await fetch("/api/move", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: originalFilename, destination: newFilename }),
        });
      }

      const res = await fetch(`/api/notes/${encodeURIComponent(newFilename)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        // Optimistically update notes list if it's new
        setNotes((prev: any[]) => {
          if (!prev.find((n: any) => n.filename === newFilename)) {
            return [{ filename: newFilename, title: selectedNote?.title || newFilename, content }, ...prev];
          }
          return prev;
        });
        // Update URL if filename changed
        if (originalFilename !== newFilename) {
          router.replace(`/notes/${encodeURIComponent(newFilename)}`);
        }
        // Refresh notes list slightly delayed to allow fsnotify Postgres indexation
        setTimeout(() => {
          fetchNotes();
          fetchTree();
        }, 500);
      } else {
        console.error("Failed to save note", await res.text());
      }
    } catch (e) {
      console.error("Failed to save note", e);
    }
  };

  const handleSearch = (query: string) => {
    fetchNotes(query);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <button onClick={() => setSidebarOpen(true)} className="p-1 hover:bg-muted rounded" title="Open Sidebar">
          <Menu size={22} />
        </button>
        <h1 className="font-bold text-lg">ASDF</h1>
        <div className="w-[30px]" /> {/* spacer for centering */}
      </div>

      {/* Sidebar: fixed panel on desktop, overlay on mobile */}
      <div className={`fixed inset-0 z-50 md:relative md:z-auto transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}>
        {/* Backdrop for mobile */}
        <div
          className={`absolute inset-0 bg-black/40 md:hidden ${sidebarOpen ? 'block' : 'hidden'}`}
          onClick={() => setSidebarOpen(false)}
        />
        <div className="relative h-full w-full md:w-80
        ">
          <Sidebar
            notes={notes}
            treeData={treeData}
            onSelectNote={(note) => { setSidebarOpen(false); requestNavigation('select', note); }}
            onCreateNote={() => { setSidebarOpen(false); requestNavigation('create'); }}
            onSearch={handleSearch}
            onOpenSettings={() => { setSidebarOpen(false); requestNavigation('settings'); }}
            onRefreshTree={fetchTree}
            showRecycleBin={showRecycleBin}
            onOpenRecycleBin={() => { setSidebarOpen(false); requestNavigation('recycle_bin'); }}
            onCloseRecycleBin={() => setShowRecycleBin(false)}
            conflictedNote={conflictedNote}
            selectedNotePath={selectedNote?.filename || null}
            onClose={() => setSidebarOpen(false)}
            onUploadFile={(name, content) => {
              setImportFile({ name, content });
            }}
            onRenameNote={handleRenameNote}
          />
        </div>
      </div>

      <CommandPalette
        notes={notes}
        onSelectNote={(note) => { setSidebarOpen(false); requestNavigation('select', note); }}
        onCreateNote={() => { setSidebarOpen(false); requestNavigation('create'); }}
      />

      {/* Main content area - add top padding on mobile for the header */}
      <div className="flex-1 flex flex-col pt-[49px] md:pt-0 overflow-hidden">
        {currentView === "settings" ? (
          <Settings />
        ) : selectedNote ? (
          <SplitEditor
            note={selectedNote}
            onSave={handleSaveNote}
            onDirtyChange={setIsEditorDirty}
            onSelectNote={handleSelectNote}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-4 text-center">
            <p className="text-xl font-semibold mb-2">Welcome to A Simple Data Flow</p>
            <p>Create a new note or select an existing one from the sidebar.</p>
          </div>
        )}
      </div>

      {pendingNavigation && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-[100]">
          <div className="bg-card w-full max-w-sm rounded-lg border border-border p-6 shadow-xl text-center">
            <h3 className="text-lg font-bold mb-2">Unsaved Changes</h3>
            <p className="text-sm text-muted-foreground mb-6">
              You have unsaved draft changes in the current note.
              Please Sync or Discard them before navigating away.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setPendingNavigation(null)}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded shadow hover:bg-secondary/80"
              >
                Go Back
              </button>
              <button
                onClick={executePendingNavigation}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded shadow hover:opacity-90"
              >
                Discard Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drag & Drop File Upload Overlay */}
      {isDraggingFile && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[200] flex flex-col items-center justify-center border-4 border-dashed border-primary m-4 rounded-xl animate-in fade-in duration-200"
          onDragLeave={() => setIsDraggingFile(false)}
          onDragOver={(e: React.DragEvent) => e.preventDefault()}
          onDrop={(e: React.DragEvent) => {
            e.preventDefault();
            setIsDraggingFile(false);
            const file = e.dataTransfer.files?.[0];
            if (file && file.name.endsWith(".md")) {
              const reader = new FileReader();
              reader.onload = (event) => {
                const text = event.target?.result;
                if (typeof text === 'string') {
                  setImportFile({ name: file.name, content: text });
                }
              };
              reader.readAsText(file);
            } else if (file) {
              alert("Only Markdown (.md) files are supported.");
            }
          }}
        >
          <Upload size={48} className="text-primary mb-4 animate-bounce" />
          <p className="text-lg font-semibold">Drop your Markdown (.md) file here</p>
          <p className="text-sm text-muted-foreground mt-1">Release to import the note</p>
        </div>
      )}

      {/* Import Note Selection Prompt Modal */}
      {importFile && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-card w-full max-w-md rounded-lg border border-border p-6 shadow-2xl flex flex-col animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <FileText size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-foreground">Import Note</h3>
                <p className="text-xs text-muted-foreground truncate">
                  File: {importFile.name}
                </p>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground mb-6">
              Would you like to save this note permanently to your vault or open it in a temporary View-Only mode?
            </p>
            
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setSaveFolderNoteData({ name: importFile.name, content: importFile.content });
                  setSelectedFolder("");
                  setImportFile(null);
                  setShowSaveFolderModal(true);
                }}
                className="w-full py-2.5 bg-primary text-primary-foreground font-medium rounded-md shadow-sm hover:opacity-90 transition flex items-center justify-center gap-2"
              >
                <FolderPlus size={16} />
                Save to Vault
              </button>
              
              <button
                onClick={() => {
                  setSelectedNote({
                    filename: importFile.name,
                    title: importFile.name.replace(".md", ""),
                    content: importFile.content,
                    isViewOnly: true
                  });
                  selectedNoteRef.current = {
                    filename: importFile.name,
                    title: importFile.name.replace(".md", ""),
                    content: importFile.content,
                    isViewOnly: true
                  };
                  setCurrentView("editor");
                  window.history.pushState(null, '', '/');
                  setImportFile(null);
                }}
                className="w-full py-2.5 bg-secondary text-secondary-foreground font-medium rounded-md hover:bg-secondary/80 transition flex items-center justify-center gap-2"
              >
                <BookOpen size={16} />
                Open as View-Only
              </button>
              
              <button
                onClick={() => setImportFile(null)}
                className="w-full py-2.5 bg-transparent text-muted-foreground font-medium rounded-md hover:bg-muted/50 transition border border-transparent hover:border-border mt-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Folder Selection Modal */}
      {showSaveFolderModal && saveFolderNoteData && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-popover border border-border shadow-2xl rounded-lg p-6 w-full max-w-md flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
            <h3 className="font-bold text-lg mb-2 text-popover-foreground">Save Note to Vault</h3>
            <p className="text-xs text-muted-foreground mb-4">Choose a filename and select the destination folder.</p>
            
            <div className="flex flex-col gap-1.5 mb-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase">File Name</label>
              <input
                type="text"
                value={saveFolderNoteData.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSaveFolderNoteData({ ...saveFolderNoteData, name: e.target.value })}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="note.md"
              />
            </div>
            
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">Select Folder</label>
            <div className="flex-1 overflow-y-auto border border-border rounded-md py-2 bg-background max-h-[30vh] mb-6">
              <button
                onClick={() => setSelectedFolder("")}
                className={`w-full text-left px-4 py-2 transition flex items-center gap-2 text-sm font-medium ${selectedFolder === "" ? "bg-primary/15 text-primary border-l-2 border-primary" : "hover:bg-muted"}`}
              >
                <ArchiveRestore size={16} className="text-muted-foreground" />
                <span>Root Directory</span>
              </button>
              
              {(() => {
                const renderFolder = (node: any, level: number): ReactNode => {
                  if (node.type !== "folder") return null;
                  const isSelected = selectedFolder === node.path;
                  return (
                    <div key={node.path}>
                      <button
                        onClick={() => setSelectedFolder(node.path)}
                        className={`w-full text-left px-4 py-2 transition flex items-center gap-2 text-sm ${isSelected ? "bg-primary/15 text-primary border-l-2 border-primary font-medium" : "hover:bg-muted"}`}
                        style={{ paddingLeft: `${level * 16 + 16}px` }}
                      >
                        <Folder size={16} className="text-secondary-foreground" />
                        <span className="truncate">{node.name}</span>
                      </button>
                      {node.children && node.children.map((child: any) => renderFolder(child, level + 1))}
                    </div>
                  );
                };
                return treeData.map((node: any) => renderFolder(node, 0));
              })()}
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSaveFolderModal(false);
                  setSaveFolderNoteData(null);
                }}
                className="px-4 py-2 hover:bg-muted rounded-md text-sm font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  let cleanName = saveFolderNoteData.name.trim();
                  if (!cleanName) {
                    alert("Please enter a file name.");
                    return;
                  }
                  if (!cleanName.endsWith(".md")) {
                    cleanName += ".md";
                  }
                  
                  const finalFilename = selectedFolder ? `${selectedFolder}/${cleanName}` : cleanName;
                  
                  // Check if note already exists
                  const fileExists = notes.some((n: any) => n.filename.toLowerCase() === finalFilename.toLowerCase());
                  if (fileExists) {
                    if (!confirm(`A file named "${cleanName}" already exists in the selected folder. Overwrite?`)) {
                      return;
                    }
                  }
                  
                  // Save
                  try {
                    const res = await fetch(`/api/notes/${encodeURIComponent(finalFilename)}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ content: saveFolderNoteData.content }),
                    });
                    if (res.ok) {
                      const newNote = {
                        filename: finalFilename,
                        title: cleanName.replace(".md", ""),
                        content: saveFolderNoteData.content,
                      };
                      setSelectedNote(newNote);
                      selectedNoteRef.current = newNote;
                      setCurrentView("editor");
                      window.history.pushState(null, '', `/notes/${encodeURIComponent(finalFilename)}`);
                      
                      fetchNotes();
                      fetchTree();
                      
                      setShowSaveFolderModal(false);
                      setSaveFolderNoteData(null);
                    } else {
                      alert("Failed to save note: " + await res.text());
                    }
                  } catch (e) {
                    console.error("Save failed", e);
                    alert("Failed to save note.");
                  }
                }}
                className="px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 transition shadow-sm text-sm"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

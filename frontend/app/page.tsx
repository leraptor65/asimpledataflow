"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import SplitEditor from "@/components/SplitEditor";
import CommandPalette from "@/components/CommandPalette";
import Settings from "@/components/Settings";

export default function Home() {
  const [notes, setNotes] = useState<any[]>([]);
  const [treeData, setTreeData] = useState<any[]>([]);
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [currentView, setCurrentView] = useState<"editor" | "settings">("editor");

  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{ type: string, payload?: any } | null>(null);
  const [showRecycleBin, setShowRecycleBin] = useState(false);

  const conflictedNote = (() => {
    if (!isEditorDirty || !selectedNote) return null;
    const dbNote = notes.find(n => n.filename === selectedNote.filename);
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

  const handleSelectNote = async (noteOrFilename: any) => {
    const filename = typeof noteOrFilename === 'string' ? noteOrFilename : noteOrFilename.filename;
    try {
      // Need to fetch full content from backend
      const res = await fetch(`/api/notes/${encodeURIComponent(filename)}`);
      if (res.ok) {
        const fullNote = await res.json();
        setSelectedNote(fullNote);
        setCurrentView("editor");
      } else {
        // Fallback for new empty notes
        if (typeof noteOrFilename !== 'string') {
          setSelectedNote(noteOrFilename);
          setCurrentView("editor");
        }
      }
    } catch (e) {
      console.error(e);
    }
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
    const filename = `Untitled-${Date.now()}.md`;
    const newNote = {
      filename,
      title: "Untitled Note",
      content: "# Untitled Note\n\nStart typing here...",
    };
    setSelectedNote(newNote);
    setCurrentView("editor");
  };

  const handleSaveNote = async (originalFilename: string, newFilename: string, content: string) => {
    try {
      // If the filename changed, and the original file existed on disk, move it first
      const isExistingNote = notes.some(n => n.filename === originalFilename);
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
        setNotes((prev) => {
          if (!prev.find(n => n.filename === newFilename)) {
            return [{ filename: newFilename, title: selectedNote?.title || newFilename, content }, ...prev];
          }
          return prev;
        });
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
      <Sidebar
        notes={notes}
        treeData={treeData}
        onSelectNote={(note) => requestNavigation('select', note)}
        onCreateNote={() => requestNavigation('create')}
        onSearch={handleSearch}
        onOpenSettings={() => requestNavigation('settings')}
        onRefreshTree={fetchTree}
        showRecycleBin={showRecycleBin}
        onOpenRecycleBin={() => requestNavigation('recycle_bin')}
        onCloseRecycleBin={() => setShowRecycleBin(false)}
        conflictedNote={conflictedNote}
      />

      <CommandPalette
        notes={notes}
        onSelectNote={(note) => requestNavigation('select', note)}
        onCreateNote={() => requestNavigation('create')}
      />

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
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <p className="text-xl font-semibold mb-2">Welcome to A Simple Data Flow</p>
          <p>Create a new note or select an existing one from the sidebar.</p>
        </div>
      )}

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
    </div>
  );
}

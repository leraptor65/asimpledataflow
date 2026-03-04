"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
    const filename = `Untitled-${Date.now()}.md`;
    const newNote = {
      filename,
      title: "Untitled Note",
      content: "# Untitled Note\n\nStart typing here...",
    };
    setSelectedNote(newNote);
    selectedNoteRef.current = newNote;
    setCurrentView("editor");
    // Use pushState instead of router.push to avoid remounting the component
    // (navigating from / to /notes/xxx are different Next.js pages)
    window.history.pushState(null, '', `/notes/${encodeURIComponent(filename)}`);
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
        selectedNotePath={selectedNote?.filename || null}
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

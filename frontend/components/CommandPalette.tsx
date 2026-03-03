"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Search } from "lucide-react";

interface CommandPaletteProps {
    notes: any[];
    onSelectNote: (note: any) => void;
    onCreateNote: () => void;
}

export default function CommandPalette({
    notes,
    onSelectNote,
    onCreateNote,
}: CommandPaletteProps) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[20vh]">
            <div className="w-full max-w-md bg-background border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col">
                <Command
                    className="flex flex-col w-full h-full"
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setOpen(false);
                    }}
                >
                    <div className="flex items-center border-b border-border px-3">
                        <Search className="w-4 h-4 mr-2 text-muted-foreground" />
                        <Command.Input
                            autoFocus
                            className="flex-1 w-full bg-transparent outline-none h-12 text-sm text-foreground placeholder:text-muted-foreground"
                            placeholder="Type a command or search notes..."
                        />
                    </div>

                    <Command.List className="max-h-[300px] overflow-y-auto p-2">
                        <Command.Empty className="p-4 text-sm text-center text-muted-foreground">
                            No results found.
                        </Command.Empty>

                        <Command.Group heading="Actions" className="text-xs font-semibold text-muted-foreground px-2 py-1">
                            <Command.Item
                                onSelect={() => {
                                    onCreateNote();
                                    setOpen(false);
                                }}
                                className="flex items-center px-2 py-2 text-sm text-foreground rounded-md cursor-pointer hover:bg-muted aria-selected:bg-muted"
                            >
                                Create New Note
                            </Command.Item>
                            <Command.Item
                                onSelect={() => {
                                    document.documentElement.classList.toggle("dark");
                                    setOpen(false);
                                }}
                                className="flex items-center px-2 py-2 text-sm text-foreground rounded-md cursor-pointer hover:bg-muted aria-selected:bg-muted"
                            >
                                Toggle Dark Mode
                            </Command.Item>
                        </Command.Group>

                        {notes.length > 0 && (
                            <Command.Group heading="Notes" className="text-xs font-semibold text-muted-foreground px-2 py-1 mt-2">
                                {notes.map((note) => (
                                    <Command.Item
                                        key={note.filename}
                                        value={note.title || note.filename}
                                        onSelect={() => {
                                            onSelectNote(note);
                                            setOpen(false);
                                        }}
                                        className="flex items-center px-2 py-2 text-sm text-foreground rounded-md cursor-pointer hover:bg-muted aria-selected:bg-muted"
                                    >
                                        {note.title || note.filename}
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}
                    </Command.List>
                </Command>
            </div>
        </div>
    );
}

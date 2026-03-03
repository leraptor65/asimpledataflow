"use client";

import { Settings as SettingsIcon, Trash2, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function Settings() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [syncInterval, setSyncInterval] = useState("0");

    useEffect(() => {
        setMounted(true);
        const savedSync = localStorage.getItem("asdf_auto_sync_interval");
        if (savedSync) setSyncInterval(savedSync);
    }, []);

    const handleSyncChange = (e: any) => {
        setSyncInterval(e.target.value);
        localStorage.setItem("asdf_auto_sync_interval", e.target.value);
    };

    const handleExport = () => {
        window.location.href = "/api/export";
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        const formData = new FormData();
        formData.append("file", file);

        try {
            await fetch("/api/import", {
                method: "POST",
                body: formData,
            });
            alert("Vault imported successfully. Please refresh the workspace to see the changes.");
            e.target.value = '';
        } catch (error) {
            console.error("Failed to import vault:", error);
            alert("Failed to import vault.");
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-8 bg-background">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                    <SettingsIcon className="w-8 h-8 text-primary" />
                    <h1 className="text-3xl font-bold text-foreground">Settings</h1>
                </div>

                <div className="space-y-6">
                    <section className="p-6 border border-border rounded-lg bg-card">
                        <h2 className="text-xl font-semibold text-card-foreground mb-4">Appearance</h2>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-medium text-foreground">Theme Selection</h3>
                                <p className="text-sm text-muted-foreground mt-1">Choose the visual style of the application.</p>
                            </div>
                            {mounted && (
                                <div className="relative">
                                    <Monitor className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                                    <select
                                        value={theme}
                                        onChange={(e) => setTheme(e.target.value)}
                                        className="appearance-none bg-background border border-input rounded-md pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-60 capitalize"
                                    >
                                        <option value="system">System</option>
                                        <option value="light">Light</option>
                                        <option value="dark">Dark</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </section>
                    <section className="p-6 border border-border rounded-lg bg-card">
                        <h2 className="text-xl font-semibold text-card-foreground mb-4">Storage & Maintenance</h2>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-medium text-foreground">Orphan Image Cleanup</h3>
                                <p className="text-sm text-muted-foreground mt-1">Remove images from the data directory<br />that are no longer referenced in any markdown notes.</p>
                            </div>
                            <button className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md transition-colors opacity-50 cursor-not-allowed" title="Not yet implemented">
                                <Trash2 size={16} />
                                Cleanup Images
                            </button>
                        </div>
                        <div className="flex items-center justify-between pt-6 mt-6 border-t border-border/50">
                            <div>
                                <h3 className="font-medium text-foreground">Backup Workspace</h3>
                                <p className="text-sm text-muted-foreground mt-1">Export all your markdown notes as a single zip archive,<br />or import an existing zip archive to your workspace.</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleExport}
                                    className="flex flex-1 justify-center items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition-colors font-medium">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                                    Export
                                </button>
                                <label className="flex flex-1 justify-center items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors font-medium cursor-pointer">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                                    Import
                                    <input type="file" accept=".zip" onChange={handleImport} className="hidden" />
                                </label>
                            </div>
                        </div>
                    </section>

                    <section className="p-6 border border-border rounded-lg bg-card">
                        <h2 className="text-xl font-semibold text-card-foreground mb-4">Editor Preferences</h2>
                        <p className="text-sm text-muted-foreground mb-4">Configure default behaviors for the Monaco Editor.</p>
                        <div className="flex items-center justify-between py-3 border-b border-border/50">
                            <span className="text-foreground text-sm font-medium">Auto-Sync Interval</span>
                            <select
                                value={syncInterval}
                                onChange={handleSyncChange}
                                className="appearance-none bg-background border border-input rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                                <option value="0">Manual Only</option>
                                <option value="60000">1 Minute</option>
                                <option value="300000">5 Minutes</option>
                                <option value="600000">10 Minutes</option>
                                <option value="3600000">1 Hour</option>
                                <option value="86400000">1 Day</option>
                                <option value="604800000">1 Week</option>
                                <option value="2592000000">1 Month</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between py-3">
                            <span className="text-foreground text-sm font-medium">Enable Bidirectional Links</span>
                            <input type="checkbox" className="w-4 h-4 rounded border-input bg-background" disabled />
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

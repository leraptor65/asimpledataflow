"use client";

import { Settings as SettingsIcon, Trash2, Monitor, Link2, Copy, ExternalLink } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface SharedLink {
    id: number;
    token: string;
    filename: string;
    expires_at: string | null;
    created_at: string;
}

export default function Settings() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [syncInterval, setSyncInterval] = useState("0");
    const [sharedLinks, setSharedLinks] = useState<SharedLink[]>([]);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [orphanImages, setOrphanImages] = useState<string[]>([]);
    const [showOrphanModal, setShowOrphanModal] = useState(false);
    const [totalImages, setTotalImages] = useState(0);
    const [biLinks, setBiLinks] = useState(true);

    useEffect(() => {
        setMounted(true);
        const savedSync = localStorage.getItem("asdf_auto_sync_interval");
        if (savedSync) setSyncInterval(savedSync);
        const savedBiLinks = localStorage.getItem("asdf_bidirectional_links");
        setBiLinks(savedBiLinks !== "false");
        fetchSharedLinks();
    }, []);

    const fetchSharedLinks = async () => {
        try {
            const res = await fetch("/api/shares");
            if (res.ok) {
                const data = await res.json();
                setSharedLinks(data || []);
            }
        } catch (e) { console.error(e); }
    };

    const handleRevokeLink = async (token: string) => {
        if (!confirm("Are you sure you want to revoke this shared link?")) return;
        try {
            await fetch(`/api/share/${token}`, { method: "DELETE" });
            fetchSharedLinks();
        } catch (e) { console.error(e); }
    };

    const handleUpdateExpiry = async (token: string, expiresIn: string) => {
        try {
            await fetch(`/api/share/${token}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expires_in: expiresIn }),
            });
            fetchSharedLinks();
        } catch (e) { console.error(e); }
    };

    const copyShareUrl = (token: string) => {
        const url = `${window.location.origin}/share/${token}`;
        navigator.clipboard.writeText(url);
        setCopiedToken(token);
        setTimeout(() => setCopiedToken(null), 2000);
    };

    const handleScanOrphans = async () => {
        try {
            const res = await fetch("/api/orphan-images");
            if (res.ok) {
                const data = await res.json();
                setOrphanImages(data.orphaned || []);
                setTotalImages(data.total || 0);
                setShowOrphanModal(true);
            }
        } catch (e) { console.error(e); }
    };

    const handleDeleteOrphans = async () => {
        try {
            await fetch("/api/orphan-images", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ images: orphanImages }),
            });
            setShowOrphanModal(false);
            setOrphanImages([]);
        } catch (e) { console.error(e); }
    };

    const isExpired = (link: SharedLink) => {
        if (!link.expires_at) return false;
        return new Date() > new Date(link.expires_at);
    };

    const formatExpiry = (link: SharedLink) => {
        if (!link.expires_at) return "Never";
        const d = new Date(link.expires_at);
        if (isExpired(link)) return "Expired";
        return d.toLocaleString();
    };

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
                        <h2 className="text-xl font-semibold text-card-foreground mb-4 flex items-center gap-2">
                            <Link2 size={20} />
                            Shared Links
                        </h2>
                        <p className="text-sm text-muted-foreground mb-4">Manage your shared note links. Links expire after 24 hours by default.</p>
                        {sharedLinks.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">No shared links yet. Use the Share button on any note to generate one.</p>
                        ) : (
                            <div className="space-y-3">
                                {sharedLinks.map((link) => (
                                    <div key={link.id} className={`p-3 rounded-md border ${isExpired(link) ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/30"}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground truncate">{link.filename.replace(".md", "")}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Expires: <span className={isExpired(link) ? "text-destructive font-medium" : ""}>{formatExpiry(link)}</span>
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={() => copyShareUrl(link.token)}
                                                    className="p-1.5 hover:bg-muted rounded transition text-muted-foreground hover:text-foreground"
                                                    title="Copy Link"
                                                >
                                                    {copiedToken === link.token ? <span className="text-xs text-green-500">Copied!</span> : <Copy size={14} />}
                                                </button>
                                                <a
                                                    href={`/share/${link.token}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1.5 hover:bg-muted rounded transition text-muted-foreground hover:text-foreground"
                                                    title="Open Link"
                                                >
                                                    <ExternalLink size={14} />
                                                </a>
                                                <select
                                                    onChange={(e) => handleUpdateExpiry(link.token, e.target.value)}
                                                    defaultValue=""
                                                    className="text-xs bg-background border border-input rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                                                    title="Change Expiry"
                                                >
                                                    <option value="" disabled>Expiry</option>
                                                    <option value="1h">1 Hour</option>
                                                    <option value="24h">24 Hours</option>
                                                    <option value="7d">7 Days</option>
                                                    <option value="30d">30 Days</option>
                                                    <option value="never">Never</option>
                                                </select>
                                                <button
                                                    onClick={() => handleRevokeLink(link.token)}
                                                    className="p-1.5 hover:bg-destructive/10 rounded transition text-destructive"
                                                    title="Revoke Link"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="p-6 border border-border rounded-lg bg-card">
                        <h2 className="text-xl font-semibold text-card-foreground mb-4">Storage &amp; Maintenance</h2>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-medium text-foreground">Orphan Image Cleanup</h3>
                                <p className="text-sm text-muted-foreground mt-1">Remove images from the data directory<br />that are no longer referenced in any markdown notes.</p>
                            </div>
                            <button
                                onClick={handleScanOrphans}
                                className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md transition-colors"
                            >
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
                            <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-input bg-background"
                                checked={biLinks}
                                onChange={(e) => {
                                    setBiLinks(e.target.checked);
                                    localStorage.setItem("asdf_bidirectional_links", String(e.target.checked));
                                }}
                            />
                        </div>
                    </section>
                </div>
            </div>

            {/* Orphan Image Cleanup Modal */}
            {showOrphanModal && (
                <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-[100]">
                    <div className="bg-card w-full max-w-md rounded-lg border border-border p-6 shadow-xl">
                        <h3 className="text-lg font-bold mb-2">Orphan Image Cleanup</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Found {totalImages} total images. {orphanImages.length} orphaned (not referenced in any note).
                        </p>
                        {orphanImages.length === 0 ? (
                            <>
                                <p className="text-sm text-green-500 text-center py-4">No orphaned images found!</p>
                                <button
                                    onClick={() => setShowOrphanModal(false)}
                                    className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition"
                                >
                                    Close
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="max-h-48 overflow-y-auto border border-border rounded p-2 mb-4 space-y-1">
                                    {orphanImages.map((img) => (
                                        <div key={img} className="text-xs text-muted-foreground font-mono truncate">{img}</div>
                                    ))}
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowOrphanModal(false)}
                                        className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDeleteOrphans}
                                        className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded hover:opacity-90 transition"
                                    >
                                        Delete {orphanImages.length} Image{orphanImages.length !== 1 ? 's' : ''}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

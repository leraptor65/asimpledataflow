"use client";

import { Settings as SettingsIcon, Trash2, Monitor, Link2, Copy, ExternalLink, Image, Upload, Paintbrush, Database, Pencil } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const Github = ({ size = 20, className = "" }: { size?: number; className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
        <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
);

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
    const [biLinks, setBiLinks] = useState(true);
    const [gitStatus, setGitStatus] = useState<any | null>(null);
    const [connectionResult, setConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
    const [checkingConnection, setCheckingConnection] = useState(false);
    const [refreshingStatus, setRefreshingStatus] = useState(false);
    const [statusError, setStatusError] = useState<string | null>(null);
    const [pushingAll, setPushingAll] = useState(false);
    const [pushAllResult, setPushAllResult] = useState<{ success: boolean; message: string } | null>(null);
    const [version, setVersion] = useState<string | null>(null);
    const [images, setImages] = useState<string[]>([]);
    const [loadingImages, setLoadingImages] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [copiedImage, setCopiedImage] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
        const savedSync = localStorage.getItem("asdf_auto_sync_interval");
        if (savedSync) setSyncInterval(savedSync);
        const savedBiLinks = localStorage.getItem("asdf_bidirectional_links");
        setBiLinks(savedBiLinks !== "false");
        fetchSharedLinks();
        fetchGitStatus();
        fetchVersion();
        fetchImages();
    }, []);

    const fetchGitStatus = async () => {
        setRefreshingStatus(true);
        setStatusError(null);
        try {
            const res = await fetch("/api/git/status");
            if (res.ok) {
                const data = await res.json();
                setGitStatus(data);
            } else {
                setStatusError(`Failed to fetch status: Server returned ${res.status} ${res.statusText}`);
            }
        } catch (e) {
            console.error("Failed to fetch git status", e);
            setStatusError("Network error: Failed to connect to the backend server.");
        } finally {
            setRefreshingStatus(false);
        }
    };

    const fetchVersion = async () => {
        try {
            const res = await fetch("/api/version");
            if (res.ok) {
                const data = await res.json();
                setVersion(data.version);
            }
        } catch (e) {
            console.error("Failed to fetch version", e);
        }
    };

    const fetchImages = async () => {
        setLoadingImages(true);
        try {
            const res = await fetch("/api/images");
            if (res.ok) {
                const data = await res.json();
                setImages(data || []);
            }
        } catch (e) {
            console.error("Failed to fetch images", e);
        } finally {
            setLoadingImages(false);
        }
    };

    const handleUploadGalleryImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append("image", file);
        setUploadingImage(true);
        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });
            if (res.ok) {
                fetchImages();
            } else {
                alert("Failed to upload image: " + await res.text());
            }
        } catch (e) {
            console.error("Failed to upload image", e);
            alert("Failed to upload image due to network error.");
        } finally {
            setUploadingImage(false);
            e.target.value = ""; // Reset file input
        }
    };

    const handleDeleteGalleryImage = async (name: string) => {
        if (!confirm(`Are you sure you want to delete '${name}'?`)) return;
        try {
            const res = await fetch(`/api/images/${encodeURIComponent(name)}`, {
                method: "DELETE",
            });
            if (res.ok) {
                fetchImages();
            } else {
                alert("Failed to delete image: " + await res.text());
            }
        } catch (e) {
            console.error("Failed to delete image", e);
            alert("Failed to delete image due to network error.");
        }
    };

    const copyMarkdownTag = (name: string) => {
        const tag = `![${name.replace(/\.[^/.]+$/, "")}](/images/${name})`;
        navigator.clipboard.writeText(tag);
        setCopiedImage(name);
        setTimeout(() => setCopiedImage(null), 2000);
    };

    const handleToggleSync = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const disabled = !e.target.checked;
        try {
            const res = await fetch("/api/git/toggle", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ disabled }),
            });
            if (res.ok) {
                setGitStatus((prev: any) => ({ ...prev, sync_disabled: disabled }));
            }
        } catch (e) { console.error("Failed to toggle sync", e); }
    };

    const handleCheckConnection = async () => {
        setCheckingConnection(true);
        setConnectionResult(null);
        try {
            const res = await fetch("/api/git/check", { method: "POST" });
            if (res.ok) {
                const data = await res.json();
                setConnectionResult(data);
            } else {
                setConnectionResult({ success: false, message: "Server error occurred during connection check." });
            }
        } catch (e) {
            setConnectionResult({ success: false, message: "Network error occurred." });
        } finally {
            setCheckingConnection(false);
            await fetchGitStatus();
        }
    };

    const handlePushAll = async () => {
        setPushingAll(true);
        setPushAllResult(null);
        try {
            const res = await fetch("/api/git/push", { method: "POST" });
            if (res.ok) {
                const data = await res.json();
                setPushAllResult(data);
            } else {
                setPushAllResult({ success: false, message: "Server error occurred during push." });
            }
        } catch (e) {
            setPushAllResult({ success: false, message: "Network error occurred." });
        } finally {
            setPushingAll(false);
            await fetchGitStatus();
        }
    };

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
                        <h2 className="text-xl font-semibold text-card-foreground mb-4 flex items-center gap-2">
                            <Paintbrush size={20} />
                            Appearance
                        </h2>
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
                                        <option value="dracula">Dracula</option>
                                        <option value="solarized-light">Solarized Light</option>
                                        <option value="solarized-dark">Solarized Dark</option>
                                        <option value="catppuccin">Catppuccin</option>
                                        <option value="nord">Nord</option>
                                        <option value="rose-pine">Rosé Pine</option>
                                        <option value="forest">Forest</option>
                                        <option value="midnight">Midnight</option>
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
                                                    <option value="12h">12 Hours</option>
                                                    <option value="24h">1 Day</option>
                                                    <option value="3d">3 Days</option>
                                                    <option value="7d">1 Week</option>
                                                    <option value="14d">2 Weeks</option>
                                                    <option value="30d">1 Month</option>
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
                        {(() => {
                            const getSyncStatus = () => {
                                if (!gitStatus) return { text: "Loading", color: "bg-muted/10 border border-muted/20", textClass: "text-muted-foreground", dot: "bg-muted-foreground" };
                                if (!gitStatus.enabled) return { text: "Not Configured", color: "bg-destructive/10 border border-destructive/20", textClass: "text-destructive", dot: "bg-destructive" };
                                if (gitStatus.sync_disabled) return { text: "Sync Suspended", color: "bg-amber-500/10 border border-amber-500/20", textClass: "text-amber-500", dot: "bg-amber-500" };
                                if (gitStatus.gh_logged_in && gitStatus.has_token) {
                                    return { text: "Connected & Active", color: "bg-green-500/10 border border-green-500/20", textClass: "text-green-500", dot: "bg-green-500" };
                                }
                                return { text: "Auth Action Required", color: "bg-amber-500/10 border border-amber-500/20", textClass: "text-amber-500", dot: "bg-amber-500" };
                            };
                            const syncStatus = getSyncStatus();

                            return (
                                <div className="flex items-center justify-between mb-4 pb-1">
                                    <h2 className="text-xl font-semibold text-card-foreground flex items-center gap-2">
                                        <Github size={20} />
                                        GitHub Sync Integration
                                    </h2>
                                    {gitStatus && (
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${syncStatus.color} ${syncStatus.textClass}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${syncStatus.dot}`} />
                                            {syncStatus.text}
                                        </span>
                                    )}
                                </div>
                            );
                        })()}
                        {gitStatus ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between pb-3 border-b border-border/50">
                                    <div>
                                        <h3 className="font-medium text-foreground">Sync Enabled</h3>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {gitStatus.enabled
                                                ? "Toggle automatic backup and sync with GitHub."
                                                : "No remote repository configured. Set GITHUB_REPO to enable."}
                                        </p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-input bg-background disabled:opacity-40"
                                        checked={gitStatus.enabled && !gitStatus.sync_disabled}
                                        disabled={!gitStatus.enabled}
                                        onChange={handleToggleSync}
                                        title={gitStatus.enabled ? "Toggle Sync" : "Sync Disabled (No Config)"}
                                    />
                                </div>

                                {/* Configuration Status Grid */}
                                <div className="space-y-3 pt-1 text-sm">
                                    <div className="grid grid-cols-3 gap-2">
                                        <span className="text-muted-foreground font-medium">GitHub CLI</span>
                                        <span className={`col-span-2 font-mono font-semibold ${gitStatus.gh_installed ? "text-green-500" : "text-amber-500"}`}>
                                            {gitStatus.gh_installed ? "Installed" : "Not Installed"}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <span className="text-muted-foreground font-medium">GH Auth Status</span>
                                        <span className={`col-span-2 font-mono font-semibold ${gitStatus.gh_logged_in ? "text-green-500" : "text-amber-500"}`}>
                                            {gitStatus.gh_logged_in ? "Logged In" : "Not Logged In"}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <span className="text-muted-foreground font-medium">Token Available</span>
                                        <span className={`col-span-2 font-mono font-semibold ${gitStatus.has_token ? "text-green-500" : "text-amber-500"}`}>
                                            {gitStatus.has_token ? "Yes" : "No"}
                                        </span>
                                    </div>
                                    {gitStatus.enabled && (
                                        <div className="grid grid-cols-3 gap-2">
                                            <span className="text-muted-foreground font-medium">Repository URL</span>
                                            <span className="col-span-2 text-foreground font-mono truncate select-all" title={gitStatus.repo}>
                                                {gitStatus.repo}
                                            </span>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-3 gap-2">
                                        <span className="text-muted-foreground font-medium">Commit Author</span>
                                        <span className="col-span-2 text-foreground font-mono">
                                            {gitStatus.author_name && gitStatus.author_email
                                                ? `${gitStatus.author_name} <${gitStatus.author_email}>`
                                                : gitStatus.author_name
                                                    ? gitStatus.author_name
                                                    : <span className="text-amber-500 font-semibold">Not Configured</span>}
                                        </span>
                                    </div>
                                </div>

                                {/* gh auth status details */}
                                {gitStatus.gh_status && (
                                    <div className="bg-muted/30 border border-border rounded p-3 text-xs font-mono leading-5 text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                                        {gitStatus.gh_status}
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="pt-2 flex flex-wrap gap-2.5">
                                    {gitStatus.enabled && (
                                        <>
                                            <button
                                                onClick={handleCheckConnection}
                                                disabled={checkingConnection || refreshingStatus}
                                                className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition disabled:opacity-50 text-sm font-semibold flex items-center gap-2"
                                            >
                                                {checkingConnection || refreshingStatus ? (
                                                    <>
                                                        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                        Checking...
                                                    </>
                                                ) : "Check Connection"}
                                            </button>
                                            <button
                                                onClick={handlePushAll}
                                                disabled={pushingAll || refreshingStatus}
                                                className="px-4 py-2 bg-primary text-primary-foreground hover:opacity-95 rounded-md transition disabled:opacity-50 text-sm font-semibold flex items-center gap-2"
                                            >
                                                {pushingAll ? (
                                                    <>
                                                        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                        Pushing...
                                                    </>
                                                ) : "Push to GitHub"}
                                            </button>
                                        </>
                                    )}
                                </div>

                                {statusError && (
                                    <div className="p-3 rounded text-xs leading-5 border border-destructive/30 bg-destructive/5 text-destructive">
                                        <p className="font-bold">Error Fetching Status:</p>
                                        <p className="mt-0.5">{statusError}</p>
                                    </div>
                                )}

                                {connectionResult && (
                                    <div className={`p-3 rounded text-xs leading-5 border ${connectionResult.success ? "border-green-500/30 bg-green-500/5 text-green-500" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
                                        <p className="font-bold">{connectionResult.success ? "Connection Active:" : "Connection Failed:"}</p>
                                        <p className="mt-0.5 whitespace-pre-wrap">{connectionResult.message}</p>
                                    </div>
                                )}

                                {pushAllResult && (
                                    <div className={`p-3 rounded text-xs leading-5 border ${pushAllResult.success ? "border-green-500/30 bg-green-500/5 text-green-500" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
                                        <p className="font-bold">{pushAllResult.success ? "Push Active:" : "Push Failed:"}</p>
                                        <p className="mt-0.5 whitespace-pre-wrap">{pushAllResult.message}</p>
                                    </div>
                                )}

                                {/* Sync Activity Logs */}
                                {gitStatus.sync_logs && gitStatus.sync_logs.length > 0 && (
                                    <details className="group border border-border/60 rounded-md bg-muted/10 p-3 mt-4">
                                        <summary className="cursor-pointer text-sm font-semibold text-foreground hover:text-primary transition select-none flex items-center justify-between">
                                            <span>Sync Activity Logs ({gitStatus.sync_logs.length})</span>
                                            <span className="text-xs text-muted-foreground font-normal">Click to view log history</span>
                                        </summary>
                                        <div className="mt-3 space-y-3 max-h-60 overflow-y-auto pr-1">
                                            {gitStatus.sync_logs.map((log: any, idx: number) => (
                                                <div key={idx} className={`p-2.5 rounded border text-xs leading-5 ${log.success ? "border-green-500/20 bg-green-500/5" : "border-destructive/20 bg-destructive/5"}`}>
                                                    <div className="flex items-center justify-between font-semibold mb-1">
                                                        <span className="text-foreground uppercase font-bold tracking-wider text-[10px]">{log.action}</span>
                                                        <span className={log.success ? "text-green-500" : "text-destructive"}>
                                                            {log.success ? "Success" : "Failed"}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground mb-1">
                                                        {new Date(log.timestamp).toLocaleString()}
                                                    </div>
                                                    {log.error && (
                                                        <div className="font-mono text-muted-foreground bg-muted/40 p-1.5 rounded border border-border/50 break-words mb-1">
                                                            {log.error}
                                                        </div>
                                                    )}
                                                    {log.recommendation && (
                                                        <div className="mt-1.5 p-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded font-medium flex gap-1.5">
                                                            <span className="font-bold">⚠️ Fix Recommendation:</span>
                                                            <span>{log.recommendation}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                )}

                                {/* Setup Instructions */}
                                <details className="group">
                                    <summary className="cursor-pointer text-sm font-semibold text-foreground hover:text-primary transition select-none py-1">
                                        Setup Instructions
                                    </summary>
                                    <div className="mt-3 bg-muted/30 border border-border rounded p-4 text-xs leading-6 text-muted-foreground space-y-3">
                                        <div>
                                            <p className="font-bold text-foreground mb-1">1. Install the GitHub CLI</p>
                                            <p>If <code className="bg-muted px-1 py-0.5 rounded font-mono">gh</code> is not already installed on your <strong>host machine</strong>:</p>
                                            <ul className="list-disc list-inside mt-1 font-mono text-[10px] space-y-0.5">
                                                <li><strong>macOS:</strong> brew install gh</li>
                                                <li><strong>Ubuntu/Debian:</strong> sudo apt install gh</li>
                                                <li><strong>Fedora:</strong> sudo dnf install gh</li>
                                                <li><strong>Arch:</strong> sudo pacman -S github-cli</li>
                                                <li><strong>Windows:</strong> winget install GitHub.cli</li>
                                                <li><strong>Other:</strong> <a href="https://github.com/cli/cli#installation" target="_blank" rel="noopener noreferrer" className="underline text-primary">github.com/cli/cli#installation</a></li>
                                            </ul>
                                        </div>
                                        <div>
                                            <p className="font-bold text-foreground mb-1">2. Authenticate with GitHub</p>
                                            <p>Run on your host machine. The <code className="bg-muted px-1 py-0.5 rounded font-mono">--insecure-storage</code> flag is <strong>required</strong> so the token is stored in the config file (instead of your OS keyring), making it accessible to the Docker container:</p>
                                            <code className="block bg-muted px-2 py-1 rounded font-mono mt-1">gh auth login --insecure-storage</code>
                                            <p className="mt-1">Follow the prompts to authenticate. You can verify with:</p>
                                            <code className="block bg-muted px-2 py-1 rounded font-mono mt-1">gh auth status</code>
                                            <p className="mt-1.5 text-amber-500/80 text-[10px]"><strong>Note:</strong> If you previously logged in without <code className="bg-muted px-1 py-0.5 rounded font-mono">--insecure-storage</code>, your token is stored in the OS keyring and won&apos;t be visible to the container. Re-run the login command above to migrate the token to the config file.</p>
                                        </div>
                                        <div>
                                            <p className="font-bold text-foreground mb-1">3. Configure Git Author</p>
                                            <p>Set your commit identity on the host machine:</p>
                                            <div className="font-mono mt-1 space-y-0.5">
                                                <code className="block bg-muted px-2 py-1 rounded">git config --global user.name &quot;Your Name&quot;</code>
                                                <code className="block bg-muted px-2 py-1 rounded">git config --global user.email &quot;you@example.com&quot;</code>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="font-bold text-foreground mb-1">4. Configure the Repository</p>
                                            <p>In your <code className="bg-muted px-1 py-0.5 rounded font-mono">compose.yml</code>, uncomment and set the repository URL:</p>
                                            <code className="block bg-muted px-2 py-1 rounded font-mono mt-1">GITHUB_REPO=https://github.com/username/repo.git</code>
                                        </div>
                                        <div>
                                            <p className="font-bold text-foreground mb-1">5. Volume Mounts (already configured)</p>
                                            <p>The compose file mounts your host&apos;s <code className="bg-muted px-1 py-0.5 rounded font-mono">~/.config/gh</code> and <code className="bg-muted px-1 py-0.5 rounded font-mono">~/.gitconfig</code> into the container so authentication and git config are shared automatically.</p>
                                        </div>
                                    </div>
                                </details>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">Loading git sync status...</p>
                        )}
                    </section>

                    <section className="p-6 border border-border rounded-lg bg-card">
                        <h2 className="text-xl font-semibold text-card-foreground mb-6 pb-2 border-b border-border/50 flex items-center gap-2">
                            <Database size={20} />
                            Storage &amp; Maintenance
                        </h2>
                        
                        {/* Workspace Backup */}
                        <div className="mb-8">
                            <h3 className="font-semibold text-foreground text-base">Workspace Backup</h3>
                            <p className="text-sm text-muted-foreground mt-1 mb-3">Export all your markdown notes as a single zip archive, or import an existing zip archive to your workspace.</p>
                            <div className="flex gap-2 max-w-xs">
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

                        {/* Image Gallery */}
                        <div className="mb-8 pt-6 border-t border-border/50">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
                                    <Image size={18} />
                                    Image Gallery
                                </h3>
                                <div>
                                    <label className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors text-xs font-semibold cursor-pointer shadow-sm">
                                        <Upload size={14} />
                                        {uploadingImage ? "Uploading..." : "Upload Image"}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            disabled={uploadingImage}
                                            onChange={handleUploadGalleryImage}
                                            className="hidden"
                                        />
                                    </label>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground mb-4">
                                Manage uploaded images in the <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">.images/</code> folder. Copy their markdown tag to use directly in notes.
                            </p>

                            {loadingImages ? (
                                <p className="text-sm text-muted-foreground text-center py-6">Loading images...</p>
                            ) : images.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">No images uploaded yet.</p>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-96 overflow-y-auto pr-1">
                                    {images.map((img) => (
                                        <div key={img} className="group relative border border-border rounded-md bg-muted/20 overflow-hidden flex flex-col hover:border-primary/50 transition">
                                            <div className="aspect-video relative bg-background border-b border-border flex items-center justify-center overflow-hidden">
                                                <img
                                                    src={`/images/${encodeURIComponent(img)}`}
                                                    alt={img}
                                                    className="object-contain w-full h-full p-1 transition-transform group-hover:scale-105"
                                                />
                                            </div>
                                            <div className="p-2 flex flex-col gap-1">
                                                <span className="text-xs text-foreground truncate font-mono" title={img}>
                                                    {img}
                                                </span>
                                                <div className="flex gap-1.5 mt-1 justify-between">
                                                    <button
                                                        onClick={() => copyMarkdownTag(img)}
                                                        className="flex-1 py-1 px-1.5 text-[10px] font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded transition flex items-center justify-center gap-1"
                                                        title="Copy Markdown Reference"
                                                    >
                                                        <Copy size={10} />
                                                        {copiedImage === img ? "Copied!" : "Copy Tag"}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteGalleryImage(img)}
                                                        className="py-1 px-1.5 text-[10px] font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 rounded transition flex items-center justify-center"
                                                        title="Delete Image"
                                                    >
                                                        <Trash2 size={10} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Editor Preferences */}
                        <div className="pt-6 border-t border-border/50">
                            <h3 className="font-semibold text-foreground text-base mb-2 flex items-center gap-2">
                                <Pencil size={18} />
                                Editor Preferences
                            </h3>
                            <p className="text-sm text-muted-foreground mb-4">Configure default behaviors for the Monaco Editor.</p>
                            <div className="flex items-center justify-between py-3 border-b border-border/30">
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
                        </div>
                    </section>

                    <section className="p-6 border border-border rounded-lg bg-card mt-6">
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground text-xs font-medium">App Version</span>
                            <span className="text-foreground text-xs font-mono font-bold bg-muted px-2.5 py-1 rounded border border-border">
                                {version || "Loading..."}
                            </span>
                        </div>
                    </section>
                </div>
            </div>


        </div>
    );
}

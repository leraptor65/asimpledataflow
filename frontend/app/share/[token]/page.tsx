"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";
import { FileText, AlertCircle, Clock } from "lucide-react";

export default function SharedNotePage() {
    const params = useParams();
    const token = params.token as string;

    const [note, setNote] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNote = async () => {
            try {
                const res = await fetch(`/api/shared/${token}`);
                if (res.ok) {
                    const data = await res.json();
                    setNote(data);
                } else if (res.status === 410) {
                    setError("This shared link has expired.");
                } else if (res.status === 404) {
                    setError("This shared link was not found or has been revoked.");
                } else {
                    setError("Something went wrong loading this note.");
                }
            } catch (e) {
                setError("Failed to load shared note.");
            } finally {
                setLoading(false);
            }
        };
        fetchNote();
    }, [token]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
                <div className="animate-pulse text-muted-foreground">Loading...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
                <div className="text-center max-w-md p-8">
                    <div className="flex justify-center mb-4">
                        {error.includes("expired") ? (
                            <Clock size={48} className="text-amber-500" />
                        ) : (
                            <AlertCircle size={48} className="text-destructive" />
                        )}
                    </div>
                    <h1 className="text-2xl font-bold mb-2">
                        {error.includes("expired") ? "Link Expired" : "Link Not Found"}
                    </h1>
                    <p className="text-muted-foreground">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-3 p-6 border-b border-border">
                    <FileText size={24} className="text-primary" />
                    <h1 className="text-2xl font-bold">{note?.title || note?.filename?.replace(".md", "")}</h1>
                </div>
                <div className="p-8">
                    <div className="prose prose-invert max-w-none">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                            rehypePlugins={[rehypeHighlight, rehypeKatex]}
                        >
                            {note?.content || "*Empty note*"}
                        </ReactMarkdown>
                    </div>
                </div>
                <div className="p-6 border-t border-border text-center text-xs text-muted-foreground">
                    Shared via A Simple Data Flow
                </div>
            </div>
        </div>
    );
}

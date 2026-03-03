import {
    Bold,
    Italic,
    Strikethrough,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    List,
    ListOrdered,
    CheckSquare,
    Quote,
    Terminal,
    Minus,
    Table,
    Link,
    Image,
    Code,
} from "lucide-react";

interface EditorToolbarProps {
    onInsert: (prefix: string, suffix?: string, defaultText?: string) => void;
}

export default function EditorToolbar({ onInsert }: EditorToolbarProps) {
    const tools = [
        { icon: Bold, label: "Bold", action: () => onInsert("**", "**", "text") },
        { icon: Italic, label: "Italic", action: () => onInsert("*", "*", "text") },
        { icon: Strikethrough, label: "Strikethrough", action: () => onInsert("~~", "~~", "text") },
        { icon: Heading1, label: "Heading 1", action: () => onInsert("# ", "") },
        { icon: Heading2, label: "Heading 2", action: () => onInsert("## ", "") },
        { icon: Heading3, label: "Heading 3", action: () => onInsert("### ", "") },
        { icon: Heading4, label: "Heading 4", action: () => onInsert("#### ", "") },
        { icon: List, label: "Bullet List", action: () => onInsert("- ", "") },
        { icon: ListOrdered, label: "Numbered List", action: () => onInsert("1. ", "") },
        { icon: CheckSquare, label: "Task List", action: () => onInsert("- [ ] ", "") },
        { icon: Quote, label: "Blockquote", action: () => onInsert("> ", "") },
        { icon: Terminal, label: "Code Block", action: () => onInsert("```\n", "\n```", "code here") },
        { icon: Minus, label: "Horizontal Rule", action: () => onInsert("\n---\n", "") },
        { icon: Table, label: "Table", action: () => onInsert("\n| Header | Header |\n| ------ | ------ |\n| Cell | Cell |\n", "") },
        { icon: Link, label: "Link", action: () => onInsert("[", "](url)", "link text") },
        { icon: Image, label: "Image", action: () => onInsert("![", "](image-url)", "alt text") },
        { icon: Code, label: "Inline Code", action: () => onInsert("`", "`", "code") },
    ];

    return (
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border bg-muted/30">
            {tools.map((tool, idx) => {
                const Icon = tool.icon;
                return (
                    <button
                        key={idx}
                        onClick={tool.action}
                        title={tool.label}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <Icon size={16} />
                    </button>
                );
            })}
        </div>
    );
}

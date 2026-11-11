import React, { useRef } from 'react';
import MarkdownWithSyntax from "./MarkdownWithSyntax";

interface ExpandableContentProps {
    content: string;
    attachments?: string[];
    isExpanded: boolean;
    onToggle: () => void;
    className?: string;
    showRaw?: boolean;
    onToggleRaw: () => void;
}

const ExpandableContent = ({
    content,
    attachments = [],
    isExpanded,
    className,
    showRaw = false,
}: ExpandableContentProps) => {
    const contentRef = useRef<HTMLDivElement>(null);
    return (
        <div className="group relative">
            {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {attachments.map((attachment, index) => (
                        <img
                            key={index}
                            src={attachment}
                            alt={`Attachment ${index + 1}`}
                            className="max-w-[200px] h-auto rounded-lg"
                        />
                    ))}
                </div>
            )}
            <div
                ref={contentRef}
                className={`${!isExpanded ? "max-h-[100px] overflow-hidden" : ""} ${className || ""} prose dark:prose-invert max-w-none`}
            >
                <MarkdownWithSyntax showRaw={showRaw}>{content}</MarkdownWithSyntax>
            </div>
        </div>
    );
};

export default ExpandableContent

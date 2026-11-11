import type { Attachment } from "../../shared/contracts";

export function parseBase64ToAttachment(base64String: string): Attachment {
    const matches = base64String.match(/^data:([^;]+);base64,(.+)$/);

    if (!matches) {
        throw new Error("Invalid base64 string format");
    }

    const [, contentType] = matches;

    return {
        contentType,
        url: base64String,
    };
}

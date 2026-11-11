import type { Attachment } from "../shared/contracts";
import { app } from "electron";
import { mkdir, writeFile } from "fs/promises";
import { join, resolve, sep } from "node:path";
import { ulid } from "ulid";

const DELTA_DATA_DIR = join(app.getPath("userData"), "delta_data");
const ATTACHMENTS_DIR = join(DELTA_DATA_DIR, "attachments");

export interface StoredAttachment {
    id: string;
    file_path: string;
    type: string;
}

export async function initAttachmentStorage() {
    await mkdir(ATTACHMENTS_DIR, { recursive: true, mode: 0o700 });
}

export async function storeAttachment(
    attachment: Attachment,
): Promise<StoredAttachment> {
    const attachmentId = ulid();
    const match = attachment.url.match(
        /^data:image\/(\w+);base64,(.+)$/,
    );
    if (!match) {
        throw new Error("Invalid base64 image data");
    }
    const [, type, cleanBase64] = match;
    const buffer = Buffer.from(cleanBase64, "base64");

    const filePath = join("attachments", attachmentId);
    const fullPath = join(ATTACHMENTS_DIR, attachmentId);

    if (buffer.length > 10 * 1024 * 1024) throw new Error("Images must be smaller than 10 MB.");
    await writeFile(fullPath, buffer, { mode: 0o600 });

    return {
        id: attachmentId,
        file_path: filePath,
        type,
    };
}
function attachmentPath(filePath: string) {
    const fullPath = resolve(DELTA_DATA_DIR, filePath);
    if (!fullPath.startsWith(resolve(ATTACHMENTS_DIR) + sep)) throw new Error("Invalid attachment path.");
    return fullPath;
}
export async function getAttachment(filePath: string): Promise<Buffer> {
    const fullPath = attachmentPath(filePath);
    const fs = await import("fs/promises");
    return fs.readFile(fullPath);
}

export async function deleteAttachment(filePath: string): Promise<void> {
    const fullPath = attachmentPath(filePath);
    const fs = await import("fs/promises");
    await fs.unlink(fullPath);
}

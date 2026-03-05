import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isSha256Digest } from "./releaseMetadata.js";

export interface UpdateDownloadInput {
    url: string;
    expectedSha256: string;
    expectedSizeBytes?: number;
    destinationDir: string;
    fileName?: string;
    authToken?: string;
    authHeaderName?: string;
    fetchImpl?: typeof fetch;
}

export interface DownloadedUpdateArtifact {
    filePath: string;
    fileName: string;
    sizeBytes: number;
    sha256: string;
}

export async function downloadAndVerifyUpdateArtifact(
    input: UpdateDownloadInput
): Promise<DownloadedUpdateArtifact> {
    const fetchImpl = input.fetchImpl || fetch;
    const downloadUrl = input.url.trim();
    if (!downloadUrl) {
        throw new Error("Update download URL is required.");
    }
    if (!isSha256Digest(input.expectedSha256)) {
        throw new Error("Expected SHA256 digest is invalid.");
    }
    if (!input.destinationDir.trim()) {
        throw new Error("Update destination directory is required.");
    }

    const headers = new Headers();
    headers.set("Accept", "application/octet-stream");
    const authToken = input.authToken?.trim();
    if (authToken) {
        const headerName = (input.authHeaderName || "Authorization").trim() || "Authorization";
        const value =
            headerName.toLowerCase() === "authorization" && !/^bearer\s+/i.test(authToken)
                ? `Bearer ${authToken}`
                : authToken;
        headers.set(headerName, value);
    }

    const response = await fetchImpl(downloadUrl, {
        method: "GET",
        headers,
    });
    if (!response.ok) {
        throw new Error(`Update download failed with status ${response.status}.`);
    }

    const payload = Buffer.from(await response.arrayBuffer());
    if (payload.length === 0) {
        throw new Error("Downloaded update artifact is empty.");
    }

    if (
        input.expectedSizeBytes !== undefined &&
        Number.isInteger(input.expectedSizeBytes) &&
        input.expectedSizeBytes > 0 &&
        payload.length !== input.expectedSizeBytes
    ) {
        throw new Error(
            `Downloaded update size mismatch. Expected ${input.expectedSizeBytes} bytes, got ${payload.length}.`
        );
    }

    const actualSha256 = createHash("sha256").update(payload).digest("hex");
    if (actualSha256.toLowerCase() !== input.expectedSha256.toLowerCase()) {
        throw new Error("Downloaded update checksum mismatch.");
    }

    const fileName = sanitizeFileName(input.fileName || inferFileNameFromUrl(downloadUrl));
    const destinationDir = path.resolve(input.destinationDir);
    const filePath = path.resolve(destinationDir, fileName);
    await fs.mkdir(destinationDir, { recursive: true });
    await fs.writeFile(filePath, payload);

    return {
        filePath,
        fileName,
        sizeBytes: payload.length,
        sha256: actualSha256,
    };
}

function inferFileNameFromUrl(downloadUrl: string): string {
    try {
        const parsed = new URL(downloadUrl);
        const lastPathSegment = parsed.pathname.split("/").filter(Boolean).pop();
        return lastPathSegment || "nexus-menubar-update.bin";
    } catch {
        return "nexus-menubar-update.bin";
    }
}

function sanitizeFileName(rawFileName: string): string {
    const trimmed = rawFileName.trim();
    const cleaned = trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    return cleaned || "nexus-menubar-update.bin";
}

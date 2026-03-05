import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadAndVerifyUpdateArtifact } from "./updateDownloader.js";

const tempDirectories: string[] = [];

async function makeTempDir() {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-menubar-update-download-"));
    tempDirectories.push(tempDir);
    return tempDir;
}

afterEach(async () => {
    await Promise.all(
        tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))
    );
});

describe("downloadAndVerifyUpdateArtifact", () => {
    it("downloads, verifies checksum, and writes artifact", async () => {
        const payload = Buffer.from("signed-update-payload", "utf8");
        const expectedSha256 = createHash("sha256").update(payload).digest("hex");
        const fetchImpl = (async () =>
            ({
                ok: true,
                status: 200,
                arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
            }) as Response) as typeof fetch;
        const destinationDir = await makeTempDir();

        const result = await downloadAndVerifyUpdateArtifact({
            url: "https://downloads.nexus.dev/menubar/stable/nexus-menubar-win-x64-0.2.0.zip",
            expectedSha256,
            expectedSizeBytes: payload.length,
            destinationDir,
            fetchImpl,
        });

        expect(result.sha256).toBe(expectedSha256);
        expect(result.sizeBytes).toBe(payload.length);
        await expect(fs.access(result.filePath)).resolves.toBeUndefined();
    });

    it("fails when checksum does not match", async () => {
        const payload = Buffer.from("tampered-payload", "utf8");
        const destinationDir = await makeTempDir();
        const fetchImpl = (async () =>
            ({
                ok: true,
                status: 200,
                arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
            }) as Response) as typeof fetch;

        await expect(
            downloadAndVerifyUpdateArtifact({
                url: "https://downloads.nexus.dev/menubar/stable/nexus-menubar-win-x64-0.2.0.zip",
                expectedSha256: "a".repeat(64),
                destinationDir,
                fetchImpl,
            })
        ).rejects.toThrow("checksum mismatch");
    });

    it("sends auth header when configured", async () => {
        const payload = Buffer.from("payload", "utf8");
        const expectedSha256 = createHash("sha256").update(payload).digest("hex");
        const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
            ({
                ok: true,
                status: 200,
                arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
            }) as Response);
        const destinationDir = await makeTempDir();

        await downloadAndVerifyUpdateArtifact({
            url: "https://downloads.nexus.dev/menubar/stable/nexus-menubar-win-x64-0.2.0.zip",
            expectedSha256,
            destinationDir,
            authToken: "abc123",
            fetchImpl: fetchSpy as unknown as typeof fetch,
        });

        const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer abc123");
    });
});

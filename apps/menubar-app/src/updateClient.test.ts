import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createUpdateManifest, signUpdateManifest } from "./releaseMetadata.js";
import {
    checkForMenubarUpdate,
    compareVersions,
    computeRolloutBucket,
    resolveManifestUrl,
} from "./updateClient.js";

const SHA = "a".repeat(64);

function createFetchOk(payload: unknown): typeof fetch {
    return (async () =>
        ({
            ok: true,
            status: 200,
            json: async () => payload,
        }) as Response) as typeof fetch;
}

function buildManifest(overrides?: Partial<ReturnType<typeof createUpdateManifest>>) {
    return {
        ...createUpdateManifest({
            channel: "stable",
            rolloutPercentage: 100,
            latestVersion: "0.2.0",
            generatedAt: "2026-03-05T00:00:00.000Z",
            artifacts: [
                {
                    fileName: "nexus-menubar-win-x64-0.2.0.zip",
                    version: "0.2.0",
                    platform: "win",
                    arch: "x64",
                    sizeBytes: 100,
                    sha256: SHA,
                    url: "https://downloads.nexus.dev/menubar/stable/nexus-menubar-win-x64-0.2.0.zip",
                },
            ],
        }),
        ...overrides,
    };
}

describe("updateClient", () => {
    it("compares semantic versions including prerelease tags", () => {
        expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
        expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
        expect(compareVersions("0.1.0-beta.1", "0.1.0-beta.2")).toBeLessThan(0);
        expect(compareVersions("0.1.0", "0.1.0-beta.5")).toBeGreaterThan(0);
    });

    it("builds manifest urls from base patterns", () => {
        expect(resolveManifestUrl("https://downloads.nexus.dev/menubar", "stable")).toBe(
            "https://downloads.nexus.dev/menubar/updates/latest-stable.json"
        );
        expect(resolveManifestUrl("https://cdn.example.com/{channel}/latest.json", "beta")).toBe(
            "https://cdn.example.com/beta/latest.json"
        );
        expect(resolveManifestUrl("https://downloads.nexus.dev/menubar/updates/latest-stable.json", "stable")).toBe(
            "https://downloads.nexus.dev/menubar/updates/latest-stable.json"
        );
    });

    it("uses deterministic rollout bucket hashing", () => {
        const first = computeRolloutBucket("machine-123", "beta", "0.2.0");
        const second = computeRolloutBucket("machine-123", "beta", "0.2.0");
        expect(first).toBe(second);
        expect(first).toBeGreaterThanOrEqual(1);
        expect(first).toBeLessThanOrEqual(100);
    });

    it("returns available when version is newer and rollout allows", async () => {
        const result = await checkForMenubarUpdate({
            manifestUrl: "https://downloads.nexus.dev/menubar/updates/latest-stable.json",
            currentVersion: "0.1.0",
            channel: "stable",
            platform: "win",
            arch: "x64",
            rolloutKey: "machine-123",
            fetchImpl: createFetchOk(buildManifest()),
        });

        expect(result.status).toBe("available");
        expect(result.latestVersion).toBe("0.2.0");
        expect(result.downloadUrl).toContain("0.2.0.zip");
        expect(result.downloadFileName).toBe("nexus-menubar-win-x64-0.2.0.zip");
        expect(result.downloadSha256).toBe(SHA);
        expect(result.downloadSizeBytes).toBe(100);
    });

    it("returns rolloutDeferred when bucket is outside staged percentage", async () => {
        const result = await checkForMenubarUpdate({
            manifestUrl: "https://downloads.nexus.dev/menubar/updates/latest-beta.json",
            currentVersion: "0.1.0",
            channel: "beta",
            platform: "win",
            arch: "x64",
            rolloutKey: "machine-123",
            fetchImpl: createFetchOk(
                buildManifest({
                    channel: "beta",
                    rolloutPercentage: 1,
                    artifacts: [
                        {
                            fileName: "nexus-menubar-win-x64-0.2.0.zip",
                            version: "0.2.0",
                            platform: "win",
                            arch: "x64",
                            sizeBytes: 100,
                            sha256: SHA,
                            url: "https://downloads.nexus.dev/menubar/beta/nexus-menubar-win-x64-0.2.0.zip",
                        },
                    ],
                })
            ),
        });

        expect(result.status).toBe("rolloutDeferred");
        expect(result.latestVersion).toBe("0.2.0");
        expect(result.rolloutPercentage).toBe(1);
    });

    it("returns upToDate when version is current", async () => {
        const result = await checkForMenubarUpdate({
            manifestUrl: "https://downloads.nexus.dev/menubar/updates/latest-stable.json",
            currentVersion: "0.2.0",
            channel: "stable",
            platform: "win",
            arch: "x64",
            rolloutKey: "machine-123",
            fetchImpl: createFetchOk(buildManifest()),
        });

        expect(result.status).toBe("upToDate");
    });

    it("returns incompatible when manifest does not include runtime artifact", async () => {
        const result = await checkForMenubarUpdate({
            manifestUrl: "https://downloads.nexus.dev/menubar/updates/latest-stable.json",
            currentVersion: "0.1.0",
            channel: "stable",
            platform: "linux",
            arch: "x64",
            rolloutKey: "machine-123",
            fetchImpl: createFetchOk(buildManifest()),
        });

        expect(result.status).toBe("incompatible");
    });

    it("verifies manifest signatures when public key is configured", async () => {
        const { privateKey, publicKey } = generateKeyPairSync("ed25519");
        const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
        const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
        const signedManifest = signUpdateManifest(buildManifest(), privatePem, "k1");

        const result = await checkForMenubarUpdate({
            manifestUrl: "https://downloads.nexus.dev/menubar/updates/latest-stable.json",
            currentVersion: "0.1.0",
            channel: "stable",
            platform: "win",
            arch: "x64",
            rolloutKey: "machine-123",
            signaturePublicKey: publicPem,
            fetchImpl: createFetchOk(signedManifest),
        });

        expect(result.status).toBe("available");
    });

    it("returns error for invalid signatures", async () => {
        const { privateKey, publicKey } = generateKeyPairSync("ed25519");
        const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
        const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
        const signedManifest = signUpdateManifest(buildManifest(), privatePem, "k1");
        const tampered = { ...signedManifest, latestVersion: "0.2.1" };

        const result = await checkForMenubarUpdate({
            manifestUrl: "https://downloads.nexus.dev/menubar/updates/latest-stable.json",
            currentVersion: "0.1.0",
            channel: "stable",
            platform: "win",
            arch: "x64",
            rolloutKey: "machine-123",
            signaturePublicKey: publicPem,
            fetchImpl: createFetchOk(tampered),
        });

        expect(result.status).toBe("error");
        expect(result.message).toContain("signature verification failed");
    });

    it("returns error when signature is required but missing", async () => {
        const result = await checkForMenubarUpdate({
            manifestUrl: "https://downloads.nexus.dev/menubar/updates/latest-stable.json",
            currentVersion: "0.1.0",
            channel: "stable",
            platform: "win",
            arch: "x64",
            rolloutKey: "machine-123",
            requireSignature: true,
            fetchImpl: createFetchOk(buildManifest()),
        });

        expect(result.status).toBe("error");
        expect(result.message).toContain("signature is required");
    });

    it("returns error when artifact checksum is malformed", async () => {
        const result = await checkForMenubarUpdate({
            manifestUrl: "https://downloads.nexus.dev/menubar/updates/latest-stable.json",
            currentVersion: "0.1.0",
            channel: "stable",
            platform: "win",
            arch: "x64",
            rolloutKey: "machine-123",
            fetchImpl: createFetchOk(
                buildManifest({
                    artifacts: [
                        {
                            fileName: "nexus-menubar-win-x64-0.2.0.zip",
                            version: "0.2.0",
                            platform: "win",
                            arch: "x64",
                            sizeBytes: 100,
                            sha256: "abc",
                            url: "https://downloads.nexus.dev/menubar/stable/nexus-menubar-win-x64-0.2.0.zip",
                        },
                    ],
                })
            ),
        });

        expect(result.status).toBe("error");
        expect(result.message).toContain("invalid sha256 digest");
    });

    it("returns error when manifest request fails", async () => {
        const failingFetch = (async () =>
            ({
                ok: false,
                status: 503,
                json: async () => ({}),
            }) as Response) as typeof fetch;

        const result = await checkForMenubarUpdate({
            manifestUrl: "https://downloads.nexus.dev/menubar/updates/latest-stable.json",
            currentVersion: "0.1.0",
            channel: "stable",
            platform: "win",
            arch: "x64",
            rolloutKey: "machine-123",
            fetchImpl: failingFetch,
        });

        expect(result.status).toBe("error");
        expect(result.message).toContain("status 503");
    });
});

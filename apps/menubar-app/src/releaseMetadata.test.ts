import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    buildArtifactUrl,
    createUpdateManifest,
    isSha256Digest,
    normalizeReleaseChannel,
    parseArtifactName,
    resolveRolloutPercentage,
    serializeManifestForSigning,
    signUpdateManifest,
    verifyUpdateManifestSignature,
} from "./releaseMetadata.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

describe("releaseMetadata", () => {
    it("normalizes release channels with aliases", () => {
        expect(normalizeReleaseChannel(undefined)).toBe("stable");
        expect(normalizeReleaseChannel("BETA")).toBe("beta");
        expect(normalizeReleaseChannel("prod")).toBe("stable");
        expect(normalizeReleaseChannel("canary")).toBe("nightly");
    });

    it("rejects unsupported release channels", () => {
        expect(() => normalizeReleaseChannel("qa")).toThrow("Unsupported release channel");
    });

    it("resolves rollout percentage with channel defaults", () => {
        expect(resolveRolloutPercentage(undefined, "stable")).toBe(100);
        expect(resolveRolloutPercentage(undefined, "beta")).toBe(40);
        expect(resolveRolloutPercentage(undefined, "nightly")).toBe(10);
        expect(resolveRolloutPercentage("25", "stable")).toBe(25);
    });

    it("rejects invalid rollout values", () => {
        expect(() => resolveRolloutPercentage("0", "stable")).toThrow("Invalid rollout percentage");
        expect(() => resolveRolloutPercentage("abc", "stable")).toThrow("Invalid rollout percentage");
        expect(() => resolveRolloutPercentage(101, "stable")).toThrow("Invalid rollout percentage");
    });

    it("parses electron artifact names with prerelease version tags", () => {
        expect(parseArtifactName("invalid-file-name.zip")).toBeNull();
        expect(parseArtifactName("nexus-menubar-win-x64-0.1.0-beta.1.zip")).toEqual({
            platform: "win",
            arch: "x64",
            version: "0.1.0-beta.1",
            extension: "zip",
        });
    });

    it("builds channel-aware artifact urls", () => {
        expect(buildArtifactUrl("https://downloads.example.com/menubar", "stable", "app.zip")).toBe(
            "https://downloads.example.com/menubar/stable/app.zip"
        );
        expect(buildArtifactUrl("https://cdn.example.com/{channel}", "beta", "app.zip")).toBe(
            "https://cdn.example.com/beta/app.zip"
        );
    });

    it("validates sha256 digests", () => {
        expect(isSha256Digest(SHA_A)).toBe(true);
        expect(isSha256Digest("abc")).toBe(false);
    });

    it("creates deterministic manifest payloads", () => {
        const manifest = createUpdateManifest({
            channel: "stable",
            rolloutPercentage: 100,
            latestVersion: "0.1.0",
            generatedAt: "2026-03-05T00:00:00.000Z",
            artifacts: [
                {
                    fileName: "nexus-menubar-linux-x64-0.1.0.zip",
                    version: "0.1.0",
                    platform: "linux",
                    arch: "x64",
                    sizeBytes: 123,
                    sha256: SHA_A,
                    url: "https://downloads.example.com/menubar/stable/nexus-menubar-linux-x64-0.1.0.zip",
                },
                {
                    fileName: "nexus-menubar-win-x64-0.1.0.zip",
                    version: "0.1.0",
                    platform: "win",
                    arch: "x64",
                    sizeBytes: 456,
                    sha256: SHA_B,
                    url: "https://downloads.example.com/menubar/stable/nexus-menubar-win-x64-0.1.0.zip",
                },
            ],
        });

        expect(serializeManifestForSigning(manifest)).toBe(
            '{"schemaVersion":1,"generatedAt":"2026-03-05T00:00:00.000Z","channel":"stable","rolloutPercentage":100,"latestVersion":"0.1.0","artifacts":[{"fileName":"nexus-menubar-linux-x64-0.1.0.zip","version":"0.1.0","platform":"linux","arch":"x64","sizeBytes":123,"sha256":"' +
                SHA_A +
                '","url":"https://downloads.example.com/menubar/stable/nexus-menubar-linux-x64-0.1.0.zip"},{"fileName":"nexus-menubar-win-x64-0.1.0.zip","version":"0.1.0","platform":"win","arch":"x64","sizeBytes":456,"sha256":"' +
                SHA_B +
                '","url":"https://downloads.example.com/menubar/stable/nexus-menubar-win-x64-0.1.0.zip"}]}'
        );
    });

    it("signs and verifies update manifests", () => {
        const { privateKey, publicKey } = generateKeyPairSync("ed25519");
        const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
        const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();

        const manifest = createUpdateManifest({
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
                    sha256: SHA_A,
                    url: "https://downloads.nexus.dev/menubar/stable/nexus-menubar-win-x64-0.2.0.zip",
                },
            ],
        });
        const signed = signUpdateManifest(manifest, privatePem, "release-signing-key");
        expect(signed.signature?.algorithm).toBe("ed25519");
        expect(signed.signature?.keyId).toBe("release-signing-key");
        expect(verifyUpdateManifestSignature(signed, publicPem)).toBe(true);

        const tampered = {
            ...signed,
            latestVersion: "0.2.1",
        };
        expect(verifyUpdateManifestSignature(tampered, publicPem)).toBe(false);
    });
});

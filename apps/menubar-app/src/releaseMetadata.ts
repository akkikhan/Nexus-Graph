import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export const RELEASE_CHANNELS = ["stable", "beta", "nightly"] as const;

export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];

export interface ParsedArtifactName {
    platform: string;
    arch: string;
    version: string;
    extension: string;
}

export interface MenubarUpdateArtifact {
    fileName: string;
    version: string;
    platform: string;
    arch: string;
    sizeBytes: number;
    sha256: string;
    url: string;
}

export interface MenubarUpdateManifestSignature {
    algorithm: "ed25519";
    keyId: string;
    value: string;
}

export interface MenubarUpdateManifest {
    schemaVersion: 1;
    generatedAt: string;
    channel: ReleaseChannel;
    rolloutPercentage: number;
    latestVersion: string;
    artifacts: MenubarUpdateArtifact[];
    signature?: MenubarUpdateManifestSignature;
}

const CHANNEL_ALIASES: Record<string, ReleaseChannel> = {
    stable: "stable",
    production: "stable",
    prod: "stable",
    ga: "stable",
    beta: "beta",
    preview: "beta",
    rc: "beta",
    nightly: "nightly",
    canary: "nightly",
};

const DEFAULT_ROLLOUT_BY_CHANNEL: Record<ReleaseChannel, number> = {
    stable: 100,
    beta: 40,
    nightly: 10,
};

const ARTIFACT_NAME_PATTERN = /^nexus-menubar-(?<platform>[^-]+)-(?<arch>[^-]+)-(?<version>.+)\.(?<extension>[^.]+)$/i;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export function normalizeReleaseChannel(input?: string): ReleaseChannel {
    const normalized = (input || "stable").trim().toLowerCase();
    const channel = CHANNEL_ALIASES[normalized];

    if (!channel) {
        throw new Error(
            `Unsupported release channel "${input}". Expected one of: ${RELEASE_CHANNELS.join(", ")}.`
        );
    }

    return channel;
}

export function resolveRolloutPercentage(
    value: number | string | undefined,
    channel: ReleaseChannel
): number {
    if (value === undefined || value === null || value === "") {
        return DEFAULT_ROLLOUT_BY_CHANNEL[channel];
    }

    const parsed = typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
        throw new Error(`Invalid rollout percentage "${value}". Expected an integer between 1 and 100.`);
    }

    return parsed;
}

export function parseArtifactName(fileName: string): ParsedArtifactName | null {
    const match = ARTIFACT_NAME_PATTERN.exec(fileName);
    if (!match?.groups) {
        return null;
    }

    const { platform, arch, version, extension } = match.groups;
    return {
        platform,
        arch,
        version,
        extension,
    };
}

export function buildArtifactUrl(baseUrl: string, channel: ReleaseChannel, fileName: string): string {
    const normalizedBase = baseUrl.trim().replace(/\/+$/, "");

    if (normalizedBase.includes("{channel}")) {
        return `${normalizedBase.replace("{channel}", channel)}/${fileName}`;
    }

    return `${normalizedBase}/${channel}/${fileName}`;
}

export function isSha256Digest(value: string): boolean {
    return SHA256_HEX_PATTERN.test(value);
}

export function createUpdateManifest(args: {
    channel: ReleaseChannel;
    rolloutPercentage: number;
    latestVersion: string;
    artifacts: MenubarUpdateArtifact[];
    generatedAt?: string;
}): MenubarUpdateManifest {
    const sortedArtifacts = [...args.artifacts].sort((left, right) => {
        const leftKey = `${left.platform}/${left.arch}/${left.fileName}`;
        const rightKey = `${right.platform}/${right.arch}/${right.fileName}`;
        return leftKey.localeCompare(rightKey);
    });

    return {
        schemaVersion: 1,
        generatedAt: args.generatedAt || new Date().toISOString(),
        channel: args.channel,
        rolloutPercentage: args.rolloutPercentage,
        latestVersion: args.latestVersion,
        artifacts: sortedArtifacts,
    };
}

export function serializeManifestForSigning(manifest: MenubarUpdateManifest): string {
    const payload = {
        schemaVersion: 1 as const,
        generatedAt: manifest.generatedAt,
        channel: manifest.channel,
        rolloutPercentage: manifest.rolloutPercentage,
        latestVersion: manifest.latestVersion,
        artifacts: manifest.artifacts.map((artifact) => ({
            fileName: artifact.fileName,
            version: artifact.version,
            platform: artifact.platform,
            arch: artifact.arch,
            sizeBytes: artifact.sizeBytes,
            sha256: artifact.sha256,
            url: artifact.url,
        })),
    };
    return JSON.stringify(payload);
}

export function signUpdateManifest(
    manifest: MenubarUpdateManifest,
    privateKeyPem: string,
    keyId = "default"
): MenubarUpdateManifest {
    const payload = Buffer.from(serializeManifestForSigning(manifest), "utf8");
    const privateKey = createPrivateKey(privateKeyPem);
    const signature = sign(null, payload, privateKey).toString("base64");

    return {
        ...manifest,
        signature: {
            algorithm: "ed25519",
            keyId,
            value: signature,
        },
    };
}

export function verifyUpdateManifestSignature(
    manifest: MenubarUpdateManifest,
    publicKeyPem: string
): boolean {
    if (!manifest.signature) {
        return false;
    }
    if (manifest.signature.algorithm !== "ed25519") {
        return false;
    }

    try {
        const payload = Buffer.from(serializeManifestForSigning(manifest), "utf8");
        const publicKey = createPublicKey(publicKeyPem);
        const signatureBuffer = Buffer.from(manifest.signature.value, "base64");
        return verify(null, payload, publicKey, signatureBuffer);
    } catch {
        return false;
    }
}

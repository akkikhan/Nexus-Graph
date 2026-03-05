import { createHash } from "node:crypto";
import {
    isSha256Digest,
    normalizeReleaseChannel,
    type MenubarUpdateManifest,
    type ReleaseChannel,
    verifyUpdateManifestSignature,
} from "./releaseMetadata.js";

export type UpdateCheckStatus =
    | "available"
    | "upToDate"
    | "rolloutDeferred"
    | "incompatible"
    | "error";

export interface MenubarUpdateCheckResult {
    status: UpdateCheckStatus;
    channel: ReleaseChannel;
    currentVersion: string;
    latestVersion?: string;
    message: string;
    manifestUrl: string;
    downloadUrl?: string;
    rolloutPercentage?: number;
    rolloutBucket?: number;
    checkedAt: string;
}

export interface MenubarUpdateCheckInput {
    manifestUrl: string;
    currentVersion: string;
    channel: string;
    platform: string;
    arch: string;
    rolloutKey: string;
    signaturePublicKey?: string;
    requireSignature?: boolean;
    fetchImpl?: typeof fetch;
}

interface SemverVersion {
    major: number;
    minor: number;
    patch: number;
    prerelease: string[];
}

export function compareVersions(left: string, right: string): number {
    const parsedLeft = parseSemver(left);
    const parsedRight = parseSemver(right);

    if (parsedLeft.major !== parsedRight.major) {
        return parsedLeft.major > parsedRight.major ? 1 : -1;
    }
    if (parsedLeft.minor !== parsedRight.minor) {
        return parsedLeft.minor > parsedRight.minor ? 1 : -1;
    }
    if (parsedLeft.patch !== parsedRight.patch) {
        return parsedLeft.patch > parsedRight.patch ? 1 : -1;
    }

    const leftHasPrerelease = parsedLeft.prerelease.length > 0;
    const rightHasPrerelease = parsedRight.prerelease.length > 0;
    if (!leftHasPrerelease && !rightHasPrerelease) {
        return 0;
    }
    if (!leftHasPrerelease) {
        return 1;
    }
    if (!rightHasPrerelease) {
        return -1;
    }

    const length = Math.max(parsedLeft.prerelease.length, parsedRight.prerelease.length);
    for (let index = 0; index < length; index += 1) {
        const leftPart = parsedLeft.prerelease[index];
        const rightPart = parsedRight.prerelease[index];
        if (leftPart === undefined) {
            return -1;
        }
        if (rightPart === undefined) {
            return 1;
        }
        if (leftPart === rightPart) {
            continue;
        }

        const leftNumeric = Number.parseInt(leftPart, 10);
        const rightNumeric = Number.parseInt(rightPart, 10);
        const leftIsNumeric = Number.isFinite(leftNumeric) && String(leftNumeric) === leftPart;
        const rightIsNumeric = Number.isFinite(rightNumeric) && String(rightNumeric) === rightPart;

        if (leftIsNumeric && rightIsNumeric) {
            return leftNumeric > rightNumeric ? 1 : -1;
        }
        if (leftIsNumeric) {
            return -1;
        }
        if (rightIsNumeric) {
            return 1;
        }
        return leftPart.localeCompare(rightPart);
    }

    return 0;
}

export function computeRolloutBucket(rolloutKey: string, channel: ReleaseChannel, version: string): number {
    const digest = createHash("sha256")
        .update(`${rolloutKey}|${channel}|${version}`)
        .digest();
    const value = digest.readUInt32BE(0);
    return (value % 100) + 1;
}

export function resolveManifestUrl(baseUrl: string, channel: string): string {
    const normalizedChannel = normalizeReleaseChannel(channel);
    const trimmedBase = baseUrl.trim().replace(/\/+$/, "");
    if (!trimmedBase) {
        throw new Error("Update manifest base URL is required.");
    }

    if (trimmedBase.includes("{channel}")) {
        return trimmedBase.replace("{channel}", normalizedChannel);
    }

    if (trimmedBase.endsWith(".json")) {
        return trimmedBase;
    }

    return `${trimmedBase}/updates/latest-${normalizedChannel}.json`;
}

export async function checkForMenubarUpdate(
    input: MenubarUpdateCheckInput
): Promise<MenubarUpdateCheckResult> {
    const fetchImpl = input.fetchImpl || fetch;
    const checkedAt = new Date().toISOString();
    const channel = normalizeReleaseChannel(input.channel);

    if (!input.rolloutKey.trim()) {
        throw new Error("Update rollout key must be a non-empty value.");
    }

    const manifestUrl = input.manifestUrl.trim();
    if (!manifestUrl) {
        throw new Error("Update manifest URL must be provided.");
    }

    try {
        const response = await fetchImpl(manifestUrl, {
            method: "GET",
            headers: {
                Accept: "application/json",
            },
        });
        if (!response.ok) {
            throw new Error(`Manifest request failed with status ${response.status}.`);
        }

        const manifest = (await response.json()) as MenubarUpdateManifest;
        validateManifestShape(manifest, channel);
        validateManifestSignature(manifest, input.signaturePublicKey, Boolean(input.requireSignature));

        const comparison = compareVersions(manifest.latestVersion, input.currentVersion);
        if (comparison <= 0) {
            return {
                status: "upToDate",
                channel,
                currentVersion: input.currentVersion,
                latestVersion: manifest.latestVersion,
                message: `Up to date on ${input.currentVersion}.`,
                manifestUrl,
                rolloutPercentage: manifest.rolloutPercentage,
                checkedAt,
            };
        }

        const artifact = manifest.artifacts.find(
            (candidate) => candidate.platform === input.platform && candidate.arch === input.arch
        );
        if (!artifact) {
            return {
                status: "incompatible",
                channel,
                currentVersion: input.currentVersion,
                latestVersion: manifest.latestVersion,
                message: `No update artifact for ${input.platform}/${input.arch}.`,
                manifestUrl,
                rolloutPercentage: manifest.rolloutPercentage,
                checkedAt,
            };
        }

        const rolloutBucket = computeRolloutBucket(input.rolloutKey, channel, manifest.latestVersion);
        if (rolloutBucket > manifest.rolloutPercentage) {
            return {
                status: "rolloutDeferred",
                channel,
                currentVersion: input.currentVersion,
                latestVersion: manifest.latestVersion,
                message: `Update ${manifest.latestVersion} is staged (${manifest.rolloutPercentage}%).`,
                manifestUrl,
                rolloutPercentage: manifest.rolloutPercentage,
                rolloutBucket,
                checkedAt,
            };
        }

        return {
            status: "available",
            channel,
            currentVersion: input.currentVersion,
            latestVersion: manifest.latestVersion,
            message: `Update ${manifest.latestVersion} is available.`,
            manifestUrl,
            downloadUrl: artifact.url,
            rolloutPercentage: manifest.rolloutPercentage,
            rolloutBucket,
            checkedAt,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            status: "error",
            channel,
            currentVersion: input.currentVersion,
            message,
            manifestUrl,
            checkedAt,
        };
    }
}

function parseSemver(version: string): SemverVersion {
    const cleaned = version.trim();
    const [corePart, prereleasePart = ""] = cleaned.split("-", 2);
    const coreSegments = corePart.split(".");
    if (coreSegments.length !== 3) {
        throw new Error(`Invalid version "${version}". Expected MAJOR.MINOR.PATCH.`);
    }

    const [majorRaw, minorRaw, patchRaw] = coreSegments;
    const major = Number.parseInt(majorRaw, 10);
    const minor = Number.parseInt(minorRaw, 10);
    const patch = Number.parseInt(patchRaw, 10);
    if (![major, minor, patch].every((part) => Number.isInteger(part) && part >= 0)) {
        throw new Error(`Invalid version "${version}". Expected numeric MAJOR.MINOR.PATCH.`);
    }

    return {
        major,
        minor,
        patch,
        prerelease: prereleasePart ? prereleasePart.split(".") : [],
    };
}

function validateManifestShape(manifest: MenubarUpdateManifest, expectedChannel: ReleaseChannel): void {
    if (!manifest || typeof manifest !== "object") {
        throw new Error("Manifest payload must be an object.");
    }
    if (manifest.schemaVersion !== 1) {
        throw new Error("Manifest schemaVersion must be 1.");
    }
    if (normalizeReleaseChannel(manifest.channel) !== expectedChannel) {
        throw new Error(
            `Manifest channel mismatch. Expected "${expectedChannel}", received "${manifest.channel}".`
        );
    }
    if (
        !Number.isInteger(manifest.rolloutPercentage) ||
        manifest.rolloutPercentage < 1 ||
        manifest.rolloutPercentage > 100
    ) {
        throw new Error("Manifest rolloutPercentage must be an integer between 1 and 100.");
    }
    if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
        throw new Error("Manifest artifacts must be a non-empty array.");
    }
    for (const artifact of manifest.artifacts) {
        if (typeof artifact.fileName !== "string" || artifact.fileName.trim().length === 0) {
            throw new Error("Manifest artifact fileName must be a non-empty string.");
        }
        if (!Number.isInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0) {
            throw new Error("Manifest artifact sizeBytes must be a positive integer.");
        }
        if (!isSha256Digest(artifact.sha256)) {
            throw new Error(`Manifest artifact ${artifact.fileName} has invalid sha256 digest.`);
        }
        if (typeof artifact.url !== "string" || !/^https?:\/\//i.test(artifact.url)) {
            throw new Error(`Manifest artifact ${artifact.fileName} must have an absolute http(s) URL.`);
        }
    }
}

function validateManifestSignature(
    manifest: MenubarUpdateManifest,
    signaturePublicKey: string | undefined,
    requireSignature: boolean
): void {
    const publicKey = signaturePublicKey?.trim() || "";
    const manifestHasSignature = Boolean(manifest.signature);

    if (requireSignature && !manifestHasSignature) {
        throw new Error("Manifest signature is required but missing.");
    }

    if (!publicKey) {
        if (requireSignature) {
            throw new Error("Manifest signature is required but no public key is configured.");
        }
        return;
    }

    if (!manifestHasSignature) {
        throw new Error("Manifest signature missing.");
    }
    if (!verifyUpdateManifestSignature(manifest, publicKey)) {
        throw new Error("Manifest signature verification failed.");
    }
}

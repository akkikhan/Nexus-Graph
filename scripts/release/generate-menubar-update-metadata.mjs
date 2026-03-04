#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const MENUBAR_PACKAGE_JSON_PATH = path.resolve(ROOT_DIR, "apps/menubar-app/package.json");
const RELEASE_METADATA_MODULE_PATH = path.resolve(
    ROOT_DIR,
    "apps/menubar-app/dist/releaseMetadata.js"
);

async function parseArgs(argv) {
    const parsed = {};

    for (let index = 0; index < argv.length; index += 1) {
        const raw = argv[index];
        if (!raw.startsWith("--")) {
            continue;
        }

        if (raw.includes("=")) {
            const [key, value] = raw.slice(2).split("=", 2);
            parsed[key] = value;
            continue;
        }

        const key = raw.slice(2);
        const next = argv[index + 1];
        if (next && !next.startsWith("--")) {
            parsed[key] = next;
            index += 1;
            continue;
        }
        parsed[key] = "true";
    }

    return parsed;
}

async function readJsonFile(filePath) {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
}

async function hashFileSha256(filePath) {
    const fileBuffer = await fs.readFile(filePath);
    return createHash("sha256").update(fileBuffer).digest("hex");
}

function toPrettyBytes(bytes) {
    return `${Number(bytes).toLocaleString("en-US")} bytes`;
}

async function run() {
    const args = await parseArgs(process.argv.slice(2));
    const outputRoot = path.resolve(ROOT_DIR, args["artifact-dir"] || "output/menubar");
    const metadataOutputDir = path.resolve(outputRoot, args["output-dir"] || "updates");

    const packageJson = await readJsonFile(MENUBAR_PACKAGE_JSON_PATH);
    const version = args.version || process.env.NEXUS_MENUBAR_RELEASE_VERSION || packageJson.version;

    const moduleExists = await fs
        .access(RELEASE_METADATA_MODULE_PATH)
        .then(() => true)
        .catch(() => false);
    if (!moduleExists) {
        throw new Error(
            "Menubar release metadata module was not found at apps/menubar-app/dist/releaseMetadata.js. " +
                "Run `pnpm --filter @nexus/menubar-app build` first."
        );
    }

    const releaseMetadataModule = await import(pathToFileURL(RELEASE_METADATA_MODULE_PATH).href);
    const normalizeReleaseChannel = releaseMetadataModule.normalizeReleaseChannel;
    const resolveRolloutPercentage = releaseMetadataModule.resolveRolloutPercentage;
    const parseArtifactName = releaseMetadataModule.parseArtifactName;
    const buildArtifactUrl = releaseMetadataModule.buildArtifactUrl;
    const createUpdateManifest = releaseMetadataModule.createUpdateManifest;

    const channel = normalizeReleaseChannel(
        args.channel || process.env.NEXUS_MENUBAR_RELEASE_CHANNEL || "stable"
    );
    const rolloutPercentage = resolveRolloutPercentage(
        args.rollout || process.env.NEXUS_MENUBAR_ROLLOUT_PERCENT,
        channel
    );
    const baseUrl = (
        args["base-url"] ||
        process.env.NEXUS_MENUBAR_UPDATE_BASE_URL ||
        "https://downloads.nexus.dev/menubar"
    ).trim();

    if (!baseUrl) {
        throw new Error("Update metadata requires a non-empty base URL.");
    }

    const files = await fs.readdir(outputRoot);
    const zipArtifacts = files.filter((fileName) => fileName.endsWith(".zip"));
    const artifacts = [];

    for (const fileName of zipArtifacts) {
        const parsed = parseArtifactName(fileName);
        if (!parsed || parsed.extension !== "zip" || parsed.version !== version) {
            continue;
        }

        const artifactPath = path.resolve(outputRoot, fileName);
        const [stats, sha256] = await Promise.all([fs.stat(artifactPath), hashFileSha256(artifactPath)]);

        artifacts.push({
            fileName,
            version: parsed.version,
            platform: parsed.platform,
            arch: parsed.arch,
            sizeBytes: stats.size,
            sha256,
            url: buildArtifactUrl(baseUrl, channel, fileName),
        });
    }

    if (artifacts.length === 0) {
        throw new Error(
            `No menubar zip artifacts for version "${version}" found in ${outputRoot}. ` +
                "Build package artifacts first."
        );
    }

    const manifest = createUpdateManifest({
        channel,
        rolloutPercentage,
        latestVersion: version,
        artifacts,
    });

    await fs.mkdir(metadataOutputDir, { recursive: true });
    const channelManifestPath = path.resolve(metadataOutputDir, `latest-${channel}.json`);
    await fs.writeFile(channelManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    let stableAliasMessage = "";
    if (channel === "stable") {
        const stableAliasPath = path.resolve(metadataOutputDir, "latest.json");
        await fs.writeFile(stableAliasPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
        stableAliasMessage = ` and ${path.relative(ROOT_DIR, stableAliasPath)}`;
    }

    process.stdout.write(
        `[menubar:metadata] channel=${channel} version=${version} rollout=${rolloutPercentage}% artifacts=${artifacts.length}\n`
    );
    artifacts.forEach((artifact) => {
        process.stdout.write(
            `[menubar:metadata] ${artifact.fileName} (${artifact.platform}/${artifact.arch}, ${toPrettyBytes(
                artifact.sizeBytes
            )})\n`
        );
    });
    process.stdout.write(
        `[menubar:metadata] wrote ${path.relative(ROOT_DIR, channelManifestPath)}${stableAliasMessage}\n`
    );
}

run().catch((error) => {
    process.stderr.write(`[menubar:metadata] FAIL: ${error.message}\n`);
    process.exitCode = 1;
});

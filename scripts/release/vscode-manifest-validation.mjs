import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const EXTENSION_PACKAGE_JSON_PATH = path.resolve(ROOT_DIR, "apps", "vscode-extension", "package.json");

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function hasCommandContributions(manifest) {
    const commands = manifest?.contributes?.commands;
    return Array.isArray(commands) && commands.length > 0;
}

export function validateVscodeManifest(manifest) {
    const errors = [];

    if (!isNonEmptyString(manifest?.name)) {
        errors.push("name is required.");
    } else if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.name)) {
        errors.push("name must be lowercase alphanumeric/hyphen and must not be scoped.");
    }

    if (!isNonEmptyString(manifest?.publisher)) {
        errors.push("publisher is required.");
    } else if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.publisher)) {
        errors.push("publisher must be lowercase alphanumeric/hyphen.");
    }

    if (!isNonEmptyString(manifest?.displayName)) {
        errors.push("displayName is required.");
    }
    if (!isNonEmptyString(manifest?.description)) {
        errors.push("description is required.");
    }
    if (!isNonEmptyString(manifest?.version)) {
        errors.push("version is required.");
    }

    if (!isNonEmptyString(manifest?.engines?.vscode)) {
        errors.push("engines.vscode is required.");
    } else if (!String(manifest.engines.vscode).startsWith("^")) {
        errors.push("engines.vscode should be a caret semver range (for example ^1.90.0).");
    }

    if (!isNonEmptyString(manifest?.main)) {
        errors.push("main is required.");
    } else if (!String(manifest.main).startsWith("./dist/")) {
        errors.push("main must point to ./dist output.");
    }

    if (!Array.isArray(manifest?.activationEvents) || manifest.activationEvents.length === 0) {
        errors.push("activationEvents must include at least one entry.");
    }

    if (!hasCommandContributions(manifest)) {
        errors.push("contributes.commands must include at least one command.");
    }

    return {
        ok: errors.length === 0,
        errors,
    };
}

export async function loadExtensionManifest(manifestPath = EXTENSION_PACKAGE_JSON_PATH) {
    const raw = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(raw);
}

export { EXTENSION_PACKAGE_JSON_PATH };

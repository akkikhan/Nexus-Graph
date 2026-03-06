#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const PNPM_BIN = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const NODE_BIN = process.platform === "win32" ? "node.exe" : "node";
const WEB_PORT = String(process.env.FULL_ACCEPTANCE_WEB_PORT || "3100");
const API_PORT = String(process.env.FULL_ACCEPTANCE_API_PORT || "3101");
const WEB_BASE_URL = `http://localhost:${WEB_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const NODE_OPTIONS = process.env.NODE_OPTIONS || "--max-old-space-size=6144";

function toShellCommand(bin, args) {
    return [bin, ...args]
        .map((part) => {
            if (!part.includes(" ")) return part;
            return `"${part.replaceAll('"', '\\"')}"`;
        })
        .join(" ");
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs = 120000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok || response.status >= 400) return;
        } catch {
            // Keep polling.
        }
        await sleep(1000);
    }
    throw new Error(`Timed out waiting for ${url}`);
}

function runCommand(label, bin, args, extraEnv = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(toShellCommand(bin, args), {
            cwd: ROOT_DIR,
            env: { ...process.env, ...extraEnv },
            stdio: "inherit",
            shell: true,
        });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${label} failed with exit code ${code}`));
        });
    });
}

function startService(label, args, extraEnv = {}) {
    const child = spawn(toShellCommand(PNPM_BIN, args), {
        cwd: ROOT_DIR,
        env: { ...process.env, ...extraEnv },
        stdio: "pipe",
        shell: true,
    });

    const prefix = `[${label}]`;
    child.stdout.on("data", (chunk) => process.stdout.write(`${prefix} ${chunk}`));
    child.stderr.on("data", (chunk) => process.stderr.write(`${prefix} ${chunk}`));
    child.on("error", (error) => process.stderr.write(`${prefix} process error: ${error.message}\n`));
    return child;
}

async function stopService(child) {
    if (!child || child.killed || child.exitCode !== null) return;

    if (process.platform === "win32") {
        await runCommand("taskkill", "taskkill", ["/pid", String(child.pid), "/T", "/F"]).catch(() => {
            child.kill();
        });
        return;
    }

    child.kill("SIGTERM");
    await sleep(500);
    if (child.exitCode === null) child.kill("SIGKILL");
}

async function run() {
    process.stdout.write(`[full-browser-acceptance-runner] starting services (web=${WEB_BASE_URL}, api=${API_BASE_URL})...\n`);

    const api = startService("api", ["--filter", "@nexus/api", "dev:once"], {
        PORT: API_PORT,
        NODE_OPTIONS,
    });

    await runCommand("Web production build", PNPM_BIN, ["--filter", "@nexus/web", "build"], {
        API_PROXY_TARGET: API_BASE_URL,
        NODE_OPTIONS,
    });

    const web = startService("web", ["--filter", "@nexus/web", "start"], {
        API_PROXY_TARGET: API_BASE_URL,
        PORT: WEB_PORT,
        NODE_OPTIONS,
    });

    try {
        await waitForHttp(`${API_BASE_URL}/health`);
        await waitForHttp(`${WEB_BASE_URL}/inbox`);
        await runCommand("Full browser acceptance", NODE_BIN, ["scripts/validation/full-browser-acceptance.mjs"], {
            WEB_BASE_URL,
        });
    } finally {
        process.stdout.write("[full-browser-acceptance-runner] stopping services...\n");
        await stopService(web);
        await stopService(api);
    }
}

run().catch((error) => {
    process.stderr.write(`[full-browser-acceptance-runner] FAIL: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});

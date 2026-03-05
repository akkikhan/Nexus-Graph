import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const EXTENSION_DIR = path.resolve(ROOT_DIR, "apps", "vscode-extension");
const OUTPUT_DIR = path.resolve(ROOT_DIR, "output", "vscode-extension");
const PNPM_BIN = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function runCommand(label, args, cwd = ROOT_DIR) {
    return new Promise((resolve, reject) => {
        const child = spawn(PNPM_BIN, args, {
            cwd,
            stdio: "inherit",
            shell: true,
        });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${label} failed with exit code ${code}`));
            }
        });
    });
}

async function run() {
    const packageJsonPath = path.resolve(EXTENSION_DIR, "package.json");
    const packageJsonRaw = await fs.readFile(packageJsonPath, "utf8");
    const manifest = JSON.parse(packageJsonRaw);
    const fileName = `${manifest.name}-${manifest.version}.vsix`;
    const artifactPath = path.resolve(OUTPUT_DIR, fileName);

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await runCommand(
        "vsce package",
        ["exec", "vsce", "package", "--no-dependencies", "--out", artifactPath],
        EXTENSION_DIR
    );

    const stat = await fs.stat(artifactPath);
    if (stat.size <= 0) {
        throw new Error(`Generated VSIX artifact is empty: ${artifactPath}`);
    }

    process.stdout.write(`[vscode:package] PASS ${artifactPath} (${stat.size} bytes)\n`);
}

run().catch((error) => {
    process.stderr.write(`[vscode:package] FAIL: ${error.message}\n`);
    process.exitCode = 1;
});

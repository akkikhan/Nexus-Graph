#!/usr/bin/env node

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const targetArg = args.find((arg) => arg.startsWith("--target="));
const target = (targetArg ? targetArg.split("=")[1] : "supabase").toLowerCase();
const shouldSeed = args.includes("--seed");

const allowedTargets = new Set(["supabase", "azure"]);
if (!allowedTargets.has(target)) {
    process.stderr.write(`[db-bootstrap] FAIL: unsupported target "${target}"\n`);
    process.exit(1);
}

function run(command, env = process.env) {
    return new Promise((resolve, reject) => {
        process.stdout.write(`[db-bootstrap] running: ${command}\n`);
        const child = spawn(command, {
            shell: true,
            stdio: "inherit",
            env,
        });
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`command failed (${code}): ${command}`));
        });
        child.on("error", reject);
    });
}

async function main() {
    await run(`node scripts/validation/db-env-preflight.mjs --target=${target}`);

    const env = { ...process.env };
    if (target === "azure" && env.AZURE_POSTGRES_URL) {
        env.DATABASE_URL = env.AZURE_POSTGRES_URL;
        delete env.SUPABASE_DATABASE_URL;
    }

    try {
        await run("pnpm --filter @nexus/db db:migrate", env);
    } catch (error) {
        process.stdout.write(
            `[db-bootstrap] migrate failed (${error instanceof Error ? error.message : String(error)}). Falling back to db:push.\n`
        );
        await run("pnpm --filter @nexus/db db:push", env);
    }

    if (target === "supabase" || shouldSeed) {
        await run("pnpm --filter @nexus/db db:seed", env);
    }

    process.stdout.write(`[db-bootstrap] PASS target=${target}\n`);
}

main().catch((error) => {
    process.stderr.write(`[db-bootstrap] FAIL: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});

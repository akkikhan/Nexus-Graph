#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(process.cwd(), "apps", "web", "src", "app");
const FORBIDDEN = new Set([
    "page.js",
    "page.js.map",
    "page.d.ts",
    "page.d.ts.map",
    "layout.js",
    "layout.js.map",
    "layout.d.ts",
    "layout.d.ts.map",
]);

async function walk(dir, out) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            await walk(full, out);
            continue;
        }
        if (FORBIDDEN.has(entry.name)) {
            out.push(full);
        }
    }
}

async function main() {
    const matches = [];
    await walk(ROOT, matches);

    if (matches.length > 0) {
        process.stderr.write("[validate:artifacts] FAIL: forbidden generated page artifacts found\n");
        for (const file of matches) {
            process.stderr.write(` - ${file}\n`);
        }
        process.exit(1);
    }

    process.stdout.write("[validate:artifacts] PASS: no generated page artifacts found\n");
}

main().catch((error) => {
    process.stderr.write(
        `[validate:artifacts] FAIL: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
});

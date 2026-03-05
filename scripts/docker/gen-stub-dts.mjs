import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function writeFile(filePath, content) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
}

// These stubs exist only to satisfy `tsc` for the API build inside Docker when
// full DTS output is intentionally skipped. Do not overwrite real DTS artifacts
// if they were already produced by package builds.
const dbDtsPath = "packages/db/dist/index.d.ts";
if (!existsSync(dbDtsPath)) {
    writeFile(
        dbDtsPath,
        [
            "export const users: any;",
            "export const repositories: any;",
            "export const stacks: any;",
            "export const branches: any;",
            "export const pullRequests: any;",
            "export const reviews: any;",
            "export const comments: any;",
            "export const mergeQueue: any;",
            "",
        ].join("\n")
    );
}

const aiDtsPath = "packages/ai/dist/index.d.ts";
if (!existsSync(aiDtsPath)) {
    writeFile(
        aiDtsPath,
        [
            "export type DiffContext = any;",
            "export type AIConfig = any;",
            "export declare function createNexusAI(config: AIConfig): any;",
            "",
        ].join("\n")
    );
}

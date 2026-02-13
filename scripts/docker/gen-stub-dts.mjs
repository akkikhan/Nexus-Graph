import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function writeFile(filePath, content) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
}

// These stubs exist only to satisfy `tsc` for the API build inside Docker when
// we intentionally skip full DTS generation to avoid OOM in constrained hosts.
writeFile(
    "packages/db/dist/index.d.ts",
    [
        "export const users: any;",
        "export const repositories: any;",
        "export const stacks: any;",
        "export const branches: any;",
        "export const pullRequests: any;",
        "export const reviews: any;",
        "export const comments: any;",
        "",
    ].join("\n")
);

writeFile(
    "packages/ai/dist/index.d.ts",
    [
        "export type DiffContext = any;",
        "export type AIConfig = any;",
        "export declare function createNexusAI(config: AIConfig): any;",
        "",
    ].join("\n")
);

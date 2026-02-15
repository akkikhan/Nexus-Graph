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
        // Enums
        "export const planEnum: any;",
        "export const roleEnum: any;",
        "export const platformEnum: any;",
        "export const prStatusEnum: any;",
        "export const reviewStatusEnum: any;",
        "export const riskLevelEnum: any;",
        "export const queueStatusEnum: any;",
        "",
        // Tables
        "export const users: any;",
        "export const organizations: any;",
        "export const orgMembers: any;",
        "export const repositories: any;",
        "export const githubInstallations: any;",
        "export const githubInstallationRepositories: any;",
        "export const stacks: any;",
        "export const branches: any;",
        "export const pullRequests: any;",
        "export const pullRequestFiles: any;",
        "export const reviews: any;",
        "export const comments: any;",
        "export const mergeQueue: any;",
        "export const aiRules: any;",
        "export const aiTraining: any;",
        "export const automations: any;",
        "export const auditLog: any;",
        "",
        // Relations (used by drizzle query typings)
        "export const usersRelations: any;",
        "export const organizationsRelations: any;",
        "export const orgMembersRelations: any;",
        "export const repositoriesRelations: any;",
        "export const githubInstallationsRelations: any;",
        "export const githubInstallationRepositoriesRelations: any;",
        "export const stacksRelations: any;",
        "export const branchesRelations: any;",
        "export const pullRequestsRelations: any;",
        "export const pullRequestFilesRelations: any;",
        "export const reviewsRelations: any;",
        "export const commentsRelations: any;",
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

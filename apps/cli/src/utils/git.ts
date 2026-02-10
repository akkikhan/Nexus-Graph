/**
 * NEXUS CLI - Git Utilities
 */

import simpleGit, { SimpleGit } from "simple-git";

let gitInstance: SimpleGit | null = null;

export async function getGit(): Promise<SimpleGit> {
    if (!gitInstance) {
        gitInstance = simpleGit({
            baseDir: process.cwd(),
            binary: "git",
            maxConcurrentProcesses: 6,
        });
    }
    return gitInstance;
}

export async function getCurrentBranch(git: SimpleGit): Promise<string> {
    const status = await git.status();
    return status.current || "HEAD";
}

export async function getTrunkBranch(git: SimpleGit): Promise<string> {
    const branches = await git.branchLocal();
    if (branches.all.includes("main")) return "main";
    if (branches.all.includes("master")) return "master";
    return branches.all[0] || "main";
}

export async function ensureCleanWorkingTree(git: SimpleGit): Promise<boolean> {
    const status = await git.status();
    return status.isClean();
}

export async function getDiff(
    git: SimpleGit,
    base: string,
    head: string,
    file?: string
): Promise<string> {
    const args = [base, head];
    if (file) args.push("--", file);
    return await git.diff(args);
}

export async function getFilesChanged(
    git: SimpleGit,
    base: string,
    head: string
): Promise<string[]> {
    const result = await git.diff(["--name-only", base, head]);
    return result
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);
}

export async function isAncestor(
    git: SimpleGit,
    ancestor: string,
    descendant: string
): Promise<boolean> {
    try {
        await git.raw(["merge-base", "--is-ancestor", ancestor, descendant]);
        return true;
    } catch {
        return false;
    }
}

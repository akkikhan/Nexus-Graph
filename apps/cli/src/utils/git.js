/**
 * NEXUS CLI - Git Utilities
 */
import simpleGit from "simple-git";
let gitInstance = null;
export async function getGit() {
    if (!gitInstance) {
        gitInstance = simpleGit({
            baseDir: process.cwd(),
            binary: "git",
            maxConcurrentProcesses: 6,
        });
    }
    return gitInstance;
}
export async function getCurrentBranch(git) {
    const status = await git.status();
    return status.current || "HEAD";
}
export async function getTrunkBranch(git) {
    const branches = await git.branchLocal();
    if (branches.all.includes("main"))
        return "main";
    if (branches.all.includes("master"))
        return "master";
    return branches.all[0] || "main";
}
export async function ensureCleanWorkingTree(git) {
    const status = await git.status();
    return status.isClean();
}
export async function getDiff(git, base, head, file) {
    const args = [base, head];
    if (file)
        args.push("--", file);
    return await git.diff(args);
}
export async function getFilesChanged(git, base, head) {
    const result = await git.diff(["--name-only", base, head]);
    return result
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);
}
export async function isAncestor(git, ancestor, descendant) {
    try {
        await git.raw(["merge-base", "--is-ancestor", ancestor, descendant]);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=git.js.map
/**
 * NEXUS CLI - Git Utilities
 */
import { SimpleGit } from "simple-git";
export declare function getGit(): Promise<SimpleGit>;
export declare function getCurrentBranch(git: SimpleGit): Promise<string>;
export declare function getTrunkBranch(git: SimpleGit): Promise<string>;
export declare function ensureCleanWorkingTree(git: SimpleGit): Promise<boolean>;
export declare function getDiff(git: SimpleGit, base: string, head: string, file?: string): Promise<string>;
export declare function getFilesChanged(git: SimpleGit, base: string, head: string): Promise<string[]>;
export declare function isAncestor(git: SimpleGit, ancestor: string, descendant: string): Promise<boolean>;
//# sourceMappingURL=git.d.ts.map
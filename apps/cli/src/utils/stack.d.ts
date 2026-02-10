/**
 * NEXUS CLI - Stack Management
 */
interface StackBranch {
    name: string;
    parent?: string;
    position: number;
    prNumber?: number;
    prStatus?: string;
    linesAdded?: number;
    linesRemoved?: number;
}
declare class StackManager {
    private stackData;
    private stackPath;
    constructor();
    private load;
    private save;
    addBranch(name: string, parent: string): Promise<void>;
    removeBranch(name: string): Promise<void>;
    getStack(currentBranch?: string): Promise<StackBranch[]>;
    updatePRInfo(branchName: string, prNumber: number, prStatus: string): Promise<void>;
    checkMerged(): Promise<string[]>;
}
export declare function getStackManager(): StackManager;
export {};
//# sourceMappingURL=stack.d.ts.map
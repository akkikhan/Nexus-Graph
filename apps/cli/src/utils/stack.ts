/**
 * NEXUS CLI - Stack Management
 */

import fs from "fs";
import path from "path";
import { getGit, getCurrentBranch, getTrunkBranch } from "./git";
import { getConfig } from "./config";

interface StackBranch {
    name: string;
    parent?: string;
    position: number;
    prNumber?: number;
    prStatus?: string;
    linesAdded?: number;
    linesRemoved?: number;
}

interface StackData {
    branches: Record<string, StackBranch>;
    trunk: string;
}

export interface StackSnapshotBranch {
    name: string;
    parent?: string;
    position: number;
    prNumber?: number;
    prStatus?: string;
}

export interface StackSnapshot {
    trunk: string;
    branches: StackSnapshotBranch[];
}

const STACK_FILE = ".nexus/stack.json";

class StackManager {
    private stackData: StackData | null = null;
    private stackPath: string;

    constructor() {
        this.stackPath = path.join(process.cwd(), STACK_FILE);
    }

    private async load(): Promise<StackData> {
        if (this.stackData) return this.stackData;

        try {
            if (fs.existsSync(this.stackPath)) {
                const content = fs.readFileSync(this.stackPath, "utf-8");
                this.stackData = JSON.parse(content);
            } else {
                const git = await getGit();
                const trunk = await getTrunkBranch(git);
                this.stackData = {
                    branches: {},
                    trunk,
                };
            }
        } catch {
            const git = await getGit();
            const trunk = await getTrunkBranch(git);
            this.stackData = {
                branches: {},
                trunk,
            };
        }

        if (!this.stackData) {
            throw new Error("Stack data not initialized");
        }

        return this.stackData;
    }

    private async save(): Promise<void> {
        if (!this.stackData) return;

        const dir = path.dirname(this.stackPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(this.stackPath, JSON.stringify(this.stackData, null, 2));
    }

    async addBranch(name: string, parent: string): Promise<void> {
        const data = await this.load();

        // Find position based on parent
        let position = 0;
        if (parent !== data.trunk && data.branches[parent]) {
            position = data.branches[parent].position + 1;
        }

        // Shift other branches up if needed
        for (const branch of Object.values(data.branches)) {
            if (branch.position >= position && branch.parent === parent) {
                branch.position++;
            }
        }

        data.branches[name] = {
            name,
            parent: parent === data.trunk ? undefined : parent,
            position,
        };

        await this.save();
    }

    async removeBranch(name: string): Promise<void> {
        const data = await this.load();

        if (data.branches[name]) {
            const removedPosition = data.branches[name].position;

            // Update children to point to this branch's parent
            for (const branch of Object.values(data.branches)) {
                if (branch.parent === name) {
                    branch.parent = data.branches[name].parent;
                }
            }

            delete data.branches[name];

            // Shift positions down
            for (const branch of Object.values(data.branches)) {
                if (branch.position > removedPosition) {
                    branch.position--;
                }
            }

            await this.save();
        }
    }

    async getStack(currentBranch?: string): Promise<StackBranch[]> {
        const data = await this.load();

        if (!currentBranch) {
            const git = await getGit();
            currentBranch = await getCurrentBranch(git);
        }

        // Build the stack by finding all connected branches
        const stack: StackBranch[] = [];

        // Find the root of the current branch's stack
        let current = currentBranch;
        const visited = new Set<string>();

        while (current && data.branches[current] && !visited.has(current)) {
            visited.add(current);
            const parent = data.branches[current].parent;
            if (parent) {
                current = parent;
            } else {
                break;
            }
        }

        // Now traverse down from root collecting all branches
        const addChildren = (parentName: string | undefined) => {
            const children = Object.values(data.branches)
                .filter((b) => b.parent === parentName)
                .sort((a, b) => a.position - b.position);

            for (const child of children) {
                stack.push(child);
                addChildren(child.name);
            }
        };

        // Start from branches with no parent (base of stack)
        const rootBranches = Object.values(data.branches)
            .filter((b) => !b.parent)
            .sort((a, b) => a.position - b.position);

        for (const root of rootBranches) {
            stack.push(root);
            addChildren(root.name);
        }

        return stack;
    }

    async updatePRInfo(
        branchName: string,
        prNumber: number,
        prStatus: string
    ): Promise<void> {
        const data = await this.load();

        if (data.branches[branchName]) {
            data.branches[branchName].prNumber = prNumber;
            data.branches[branchName].prStatus = prStatus;
            await this.save();
        }
    }

    async checkMerged(): Promise<string[]> {
        const data = await this.load();
        const merged: string[] = [];

        for (const branch of Object.values(data.branches)) {
            if (branch.prStatus === "merged") {
                merged.push(branch.name);
            }
        }

        return merged;
    }

    async getSnapshot(): Promise<StackSnapshot> {
        const data = await this.load();
        const branches = Object.values(data.branches)
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((branch) => ({
                name: branch.name,
                parent: branch.parent,
                position: branch.position,
                prNumber: branch.prNumber,
                prStatus: branch.prStatus,
            }));

        return {
            trunk: data.trunk,
            branches,
        };
    }
}

let stackManagerInstance: StackManager | null = null;

export function getStackManager(): StackManager {
    if (!stackManagerInstance) {
        stackManagerInstance = new StackManager();
    }
    return stackManagerInstance;
}

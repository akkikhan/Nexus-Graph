/**
 * NEXUS CLI - Stack Management
 */
import fs from "fs";
import path from "path";
import { getGit, getCurrentBranch, getTrunkBranch } from "./git";
const STACK_FILE = ".nexus/stack.json";
class StackManager {
    stackData = null;
    stackPath;
    constructor() {
        this.stackPath = path.join(process.cwd(), STACK_FILE);
    }
    async load() {
        if (this.stackData)
            return this.stackData;
        try {
            if (fs.existsSync(this.stackPath)) {
                const content = fs.readFileSync(this.stackPath, "utf-8");
                this.stackData = JSON.parse(content);
            }
            else {
                const git = await getGit();
                const trunk = await getTrunkBranch(git);
                this.stackData = {
                    branches: {},
                    trunk,
                };
            }
        }
        catch {
            const git = await getGit();
            const trunk = await getTrunkBranch(git);
            this.stackData = {
                branches: {},
                trunk,
            };
        }
        return this.stackData;
    }
    async save() {
        if (!this.stackData)
            return;
        const dir = path.dirname(this.stackPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.stackPath, JSON.stringify(this.stackData, null, 2));
    }
    async addBranch(name, parent) {
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
    async removeBranch(name) {
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
    async getStack(currentBranch) {
        const data = await this.load();
        if (!currentBranch) {
            const git = await getGit();
            currentBranch = await getCurrentBranch(git);
        }
        // Build the stack by finding all connected branches
        const stack = [];
        // Find the root of the current branch's stack
        let current = currentBranch;
        const visited = new Set();
        while (current && data.branches[current] && !visited.has(current)) {
            visited.add(current);
            const parent = data.branches[current].parent;
            if (parent) {
                current = parent;
            }
            else {
                break;
            }
        }
        // Now traverse down from root collecting all branches
        const addChildren = (parentName) => {
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
    async updatePRInfo(branchName, prNumber, prStatus) {
        const data = await this.load();
        if (data.branches[branchName]) {
            data.branches[branchName].prNumber = prNumber;
            data.branches[branchName].prStatus = prStatus;
            await this.save();
        }
    }
    async checkMerged() {
        const data = await this.load();
        const merged = [];
        for (const branch of Object.values(data.branches)) {
            if (branch.prStatus === "merged") {
                merged.push(branch.name);
            }
        }
        return merged;
    }
}
let stackManagerInstance = null;
export function getStackManager() {
    if (!stackManagerInstance) {
        stackManagerInstance = new StackManager();
    }
    return stackManagerInstance;
}
//# sourceMappingURL=stack.js.map
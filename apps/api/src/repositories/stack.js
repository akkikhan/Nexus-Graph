/**
 * NEXUS Repository Layer - Stacks
 */
import { eq, desc, and } from "drizzle-orm";
import { db, stacks, branches, pullRequests } from "../db/index.js";
export const stackRepository = {
    /**
     * Create a new stack
     */
    async create(input) {
        const [stack] = await db
            .insert(stacks)
            .values({
            repoId: input.repoId,
            userId: input.userId,
            name: input.name,
            baseBranch: input.baseBranch ?? "main",
            status: "active",
        })
            .returning();
        return stack;
    },
    /**
     * Find stack by ID
     */
    async findById(id) {
        return db.query.stacks.findFirst({
            where: eq(stacks.id, id),
            with: {
                repository: true,
                user: true,
                branches: {
                    orderBy: [branches.position],
                },
            },
        });
    },
    /**
     * List stacks for a user
     */
    async listForUser(userId, options) {
        const conditions = [];
        if (userId) {
            conditions.push(eq(stacks.userId, userId));
        }
        if (options?.repoId) {
            conditions.push(eq(stacks.repoId, options.repoId));
        }
        return db.query.stacks.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            with: {
                repository: true,
                branches: {
                    orderBy: [branches.position],
                },
            },
            orderBy: [desc(stacks.updatedAt)],
        });
    },
    /**
     * Add a branch to a stack
     */
    async addBranch(input) {
        const [branch] = await db
            .insert(branches)
            .values({
            stackId: input.stackId,
            repoId: input.repoId,
            name: input.name,
            position: input.position,
            parentBranchId: input.parentBranchId,
        })
            .returning();
        // Update stack timestamp
        await db
            .update(stacks)
            .set({ updatedAt: new Date() })
            .where(eq(stacks.id, input.stackId));
        return branch;
    },
    /**
     * Update branch position
     */
    async updateBranchPosition(branchId, position) {
        const [updated] = await db
            .update(branches)
            .set({ position, updatedAt: new Date() })
            .where(eq(branches.id, branchId))
            .returning();
        return updated;
    },
    /**
     * Link branch to PR
     */
    async linkBranchToPR(branchId, pr) {
        const [updated] = await db
            .update(branches)
            .set({
            prNumber: pr.number,
            prUrl: pr.url,
            prTitle: pr.title,
            prStatus: pr.status,
            updatedAt: new Date(),
        })
            .where(eq(branches.id, branchId))
            .returning();
        return updated;
    },
    /**
     * Get full stack with PR details
     */
    async getWithPRDetails(id) {
        const stack = await db.query.stacks.findFirst({
            where: eq(stacks.id, id),
            with: {
                repository: true,
                user: true,
                branches: {
                    orderBy: [branches.position],
                },
            },
        });
        if (!stack)
            return null;
        // Enrich branches with PR data
        const enrichedBranches = await Promise.all(stack.branches.map(async (branch) => {
            if (!branch.prNumber)
                return { ...branch, pullRequest: null };
            const pr = await db.query.pullRequests.findFirst({
                where: and(eq(pullRequests.repoId, stack.repoId), eq(pullRequests.number, branch.prNumber)),
            });
            return { ...branch, pullRequest: pr };
        }));
        return { ...stack, branches: enrichedBranches };
    },
    /**
     * Mark stack as merged
     */
    async markMerged(id) {
        const [updated] = await db
            .update(stacks)
            .set({ status: "merged", updatedAt: new Date() })
            .where(eq(stacks.id, id))
            .returning();
        return updated;
    },
    /**
     * Delete a stack
     */
    async delete(id) {
        await db.delete(stacks).where(eq(stacks.id, id));
    },
};
//# sourceMappingURL=stack.js.map

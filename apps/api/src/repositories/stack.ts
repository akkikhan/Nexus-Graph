/**
 * NEXUS Repository Layer - Stacks
 */

import { eq, desc, and } from "drizzle-orm";
import { db, stacks, branches, pullRequests } from "../db";

export interface CreateStackInput {
    repoId: string;
    userId: string;
    name: string;
    baseBranch?: string;
}

export interface AddBranchInput {
    stackId: string;
    repoId: string;
    name: string;
    position: number;
    parentBranchId?: string;
}

export const stackRepository = {
    /**
     * Create a new stack
     */
    async create(input: CreateStackInput) {
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
    async findById(id: string) {
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
    async listForUser(userId: string, options?: { repoId?: string }) {
        const conditions = [eq(stacks.userId, userId)];

        if (options?.repoId) {
            conditions.push(eq(stacks.repoId, options.repoId));
        }

        return db.query.stacks.findMany({
            where: and(...conditions),
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
    async addBranch(input: AddBranchInput) {
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
    async updateBranchPosition(branchId: string, position: number) {
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
    async linkBranchToPR(
        branchId: string,
        pr: { number: number; url: string; title: string; status: any }
    ) {
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
    async getWithPRDetails(id: string) {
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

        if (!stack) return null;

        // Enrich branches with PR data
        const enrichedBranches = await Promise.all(
            stack.branches.map(async (branch) => {
                if (!branch.prNumber) return { ...branch, pullRequest: null };

                const pr = await db.query.pullRequests.findFirst({
                    where: and(
                        eq(pullRequests.repoId, stack.repoId),
                        eq(pullRequests.number, branch.prNumber)
                    ),
                });

                return { ...branch, pullRequest: pr };
            })
        );

        return { ...stack, branches: enrichedBranches };
    },

    /**
     * Mark stack as merged
     */
    async markMerged(id: string) {
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
    async delete(id: string) {
        await db.delete(stacks).where(eq(stacks.id, id));
    },
};

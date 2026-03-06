/**
 * NEXUS Repository Layer - Stacks
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, stacks, branches, pullRequests, repositories, users } from "../db/index.js";

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

export interface AddBranchByNameInput {
    stackId: string;
    branchName: string;
    parentBranchName?: string;
    prId?: string;
}

export interface SyncLocalStackInput {
    stackName: string;
    repo?: string;
    user?: string;
    snapshot: {
        trunk: string;
        branches: Array<{
            name: string;
            parent?: string;
            position: number;
            prNumber?: number;
            prStatus?: string;
        }>;
    };
}

type BranchStatus =
    | "draft"
    | "open"
    | "approved"
    | "changes_requested"
    | "merged"
    | "closed";

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeStatus(status?: string): BranchStatus | null {
    if (!status) return null;
    if (
        status === "draft" ||
        status === "open" ||
        status === "approved" ||
        status === "changes_requested" ||
        status === "merged" ||
        status === "closed"
    ) {
        return status;
    }
    return null;
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

async function resolveRepositoryId(repoRef?: string): Promise<string | null> {
    if (repoRef) {
        const repo = isUuid(repoRef)
            ? await db.query.repositories.findFirst({
                where: eq(repositories.id, repoRef),
                columns: { id: true },
            })
            : await db.query.repositories.findFirst({
                where: sql`${repositories.id} = ${repoRef}
                    OR ${repositories.name} = ${repoRef}
                    OR ${repositories.fullName} = ${repoRef}
                    OR ${repositories.externalId} = ${repoRef}`,
                columns: { id: true },
            });
        if (repo?.id) return repo.id;
    }

    const fallback = await db.query.repositories.findFirst({
        columns: { id: true },
        orderBy: [asc(repositories.createdAt)],
    });
    return fallback?.id || null;
}

async function resolveUserId(userRef?: string): Promise<string | null> {
    if (userRef) {
        const user = isUuid(userRef)
            ? await db.query.users.findFirst({
                where: eq(users.id, userRef),
                columns: { id: true },
            })
            : await db.query.users.findFirst({
                where: sql`${users.id} = ${userRef}
                OR ${users.email} = ${userRef}
                OR ${users.name} = ${userRef}`,
                columns: { id: true },
            });
        if (user?.id) return user.id;
    }

    const fallback = await db.query.users.findFirst({
        columns: { id: true },
        orderBy: [asc(users.createdAt)],
    });
    return fallback?.id || null;
}

export const stackRepository = {
    errorMessage,

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

    async createResolved(input: {
        repositoryId?: string;
        userId?: string;
        name: string;
        baseBranch?: string;
    }) {
        const repoId = await resolveRepositoryId(input.repositoryId);
        const userId = await resolveUserId(input.userId);
        if (!repoId || !userId) return null;

        return this.create({
            repoId,
            userId,
            name: input.name,
            baseBranch: input.baseBranch,
        });
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
                    orderBy: [asc(branches.position)],
                },
            },
        });
    },

    /**
     * List stacks for a user
     */
    async listForUser(userId?: string, options?: { repoId?: string }) {
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
                    orderBy: [asc(branches.position)],
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
                    orderBy: [asc(branches.position)],
                },
            },
        });

        if (!stack) return null;

        // Enrich branches with PR data
        const enrichedBranches = await Promise.all(
            stack.branches.map(async (branch: any) => {
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

    async syncLocalSnapshot(input: SyncLocalStackInput) {
        const repoId = await resolveRepositoryId(input.repo);
        const userId = await resolveUserId(input.user);
        if (!repoId || !userId) return null;

        const stackName = input.stackName || "local-stack";
        const existingStack = await db.query.stacks.findFirst({
            where: and(
                eq(stacks.repoId, repoId),
                eq(stacks.userId, userId),
                eq(stacks.name, stackName)
            ),
            columns: { id: true },
        });

        let stackId = existingStack?.id;
        if (!stackId) {
            const [created] = await db
                .insert(stacks)
                .values({
                    repoId,
                    userId,
                    name: stackName,
                    baseBranch: input.snapshot.trunk || "main",
                    status: "active",
                })
                .returning({ id: stacks.id });
            stackId = created?.id;
        } else {
            await db
                .update(stacks)
                .set({
                    baseBranch: input.snapshot.trunk || "main",
                    updatedAt: new Date(),
                })
                .where(eq(stacks.id, stackId));
        }

        if (!stackId) return null;

        const snapshotBranches = input.snapshot.branches
            .slice()
            .sort((a, b) => a.position - b.position);
        const existingBranches = await db.query.branches.findMany({
            where: eq(branches.stackId, stackId),
            columns: { id: true, name: true },
        });
        const existingByName = new Map(existingBranches.map((item) => [item.name, item]));
        const snapshotNames = new Set(snapshotBranches.map((item) => item.name));

        for (const existing of existingBranches) {
            if (!snapshotNames.has(existing.name)) {
                await db.delete(branches).where(eq(branches.id, existing.id));
            }
        }

        const branchIdByName = new Map<string, string>();
        for (const branch of snapshotBranches) {
            const normalizedStatus = normalizeStatus(branch.prStatus);
            const existing = existingByName.get(branch.name);
            if (existing) {
                const [updated] = await db
                    .update(branches)
                    .set({
                        position: branch.position,
                        prNumber: branch.prNumber ?? null,
                        prStatus: normalizedStatus,
                        prTitle: branch.prNumber ? `PR #${branch.prNumber}` : null,
                        updatedAt: new Date(),
                    })
                    .where(eq(branches.id, existing.id))
                    .returning({ id: branches.id });
                if (updated?.id) branchIdByName.set(branch.name, updated.id);
            } else {
                const [created] = await db
                    .insert(branches)
                    .values({
                        stackId,
                        repoId,
                        name: branch.name,
                        position: branch.position,
                        prNumber: branch.prNumber ?? null,
                        prStatus: normalizedStatus,
                        prTitle: branch.prNumber ? `PR #${branch.prNumber}` : null,
                    })
                    .returning({ id: branches.id });
                if (created?.id) branchIdByName.set(branch.name, created.id);
            }
        }

        for (const branch of snapshotBranches) {
            const branchId = branchIdByName.get(branch.name);
            if (!branchId) continue;
            const parentId = branch.parent ? branchIdByName.get(branch.parent) || null : null;
            await db
                .update(branches)
                .set({
                    parentBranchId: parentId,
                    updatedAt: new Date(),
                })
                .where(eq(branches.id, branchId));
        }

        await db
            .update(stacks)
            .set({ updatedAt: new Date() })
            .where(eq(stacks.id, stackId));

        return {
            stackId,
            branches: snapshotBranches.length,
        };
    },

    async addBranchByName(input: AddBranchByNameInput) {
        const stack = await db.query.stacks.findFirst({
            where: eq(stacks.id, input.stackId),
            columns: { id: true, repoId: true },
        });
        if (!stack) {
            return { reason: "stack_not_found" as const };
        }

        const stackBranches = await db.query.branches.findMany({
            where: eq(branches.stackId, input.stackId),
            columns: { id: true, name: true, position: true, prStatus: true },
        });
        const existing = stackBranches.find((branch) => branch.name === input.branchName);
        if (existing) {
            return {
                reason: "ok" as const,
                created: false,
                branch: existing,
            };
        }

        let parentBranchId: string | undefined;
        if (input.parentBranchName) {
            const parent = stackBranches.find((branch) => branch.name === input.parentBranchName);
            if (!parent) {
                return {
                    reason: "parent_not_found" as const,
                };
            }
            parentBranchId = parent.id;
        }

        const nextPosition = stackBranches.length === 0
            ? 0
            : Math.max(...stackBranches.map((branch) => branch.position)) + 1;

        let prData: { number: number; title: string; status: BranchStatus | null; url: string | null } | null = null;
        if (input.prId) {
            const pr = await db.query.pullRequests.findFirst({
                where: eq(pullRequests.id, input.prId),
                columns: {
                    number: true,
                    title: true,
                    status: true,
                    url: true,
                },
            });
            if (pr) {
                prData = {
                    number: pr.number,
                    title: pr.title,
                    status: normalizeStatus(pr.status),
                    url: pr.url,
                };
            }
        }

        const [created] = await db
            .insert(branches)
            .values({
                stackId: stack.id,
                repoId: stack.repoId,
                name: input.branchName,
                position: nextPosition,
                parentBranchId,
                prNumber: prData?.number ?? null,
                prTitle: prData?.title ?? null,
                prStatus: prData?.status ?? null,
                prUrl: prData?.url ?? null,
            })
            .returning({
                id: branches.id,
                name: branches.name,
                position: branches.position,
                parentBranchId: branches.parentBranchId,
                prNumber: branches.prNumber,
                prStatus: branches.prStatus,
            });

        await db
            .update(stacks)
            .set({ updatedAt: new Date() })
            .where(eq(stacks.id, stack.id));

        return {
            reason: "ok" as const,
            created: true,
            branch: created,
        };
    },

    async reorderByBranchName(
        stackId: string,
        ordered: Array<{ branchName: string; order: number }>
    ) {
        const stack = await db.query.stacks.findFirst({
            where: eq(stacks.id, stackId),
            columns: { id: true },
        });
        if (!stack) {
            return { reason: "stack_not_found" as const };
        }

        const stackBranches = await db.query.branches.findMany({
            where: eq(branches.stackId, stackId),
            columns: { id: true, name: true, position: true },
            orderBy: [asc(branches.position)],
        });
        const branchByName = new Map(stackBranches.map((branch) => [branch.name, branch]));
        const missingBranchNames = ordered
            .map((item) => item.branchName)
            .filter((name) => !branchByName.has(name));
        if (missingBranchNames.length > 0) {
            return {
                reason: "missing_branches" as const,
                missingBranchNames,
            };
        }

        const requestedOrder = new Map(ordered.map((item) => [item.branchName, item.order]));
        const normalized = stackBranches
            .map((branch) => ({
                ...branch,
                requestedOrder: requestedOrder.get(branch.name) ?? branch.position,
            }))
            .sort((a, b) => {
                if (a.requestedOrder === b.requestedOrder) {
                    return a.position - b.position;
                }
                return a.requestedOrder - b.requestedOrder;
            })
            .map((branch, index) => ({
                id: branch.id,
                name: branch.name,
                position: index,
            }));

        await db.transaction(async (tx) => {
            for (const branch of normalized) {
                await tx
                    .update(branches)
                    .set({
                        position: branch.position,
                        updatedAt: new Date(),
                    })
                    .where(eq(branches.id, branch.id));
            }

            await tx
                .update(stacks)
                .set({ updatedAt: new Date() })
                .where(eq(stacks.id, stackId));
        });

        return {
            reason: "ok" as const,
            branches: normalized,
        };
    },

    async sync(id: string) {
        const stack = await db.query.stacks.findFirst({
            where: eq(stacks.id, id),
            with: {
                branches: {
                    columns: { id: true },
                },
            },
        });
        if (!stack) return null;

        await db
            .update(stacks)
            .set({ updatedAt: new Date() })
            .where(eq(stacks.id, id));

        return {
            stackId: id,
            branchesRebased: stack.branches.length,
            conflictsDetected: 0,
        };
    },

    async submit(id: string) {
        const stack = await db.query.stacks.findFirst({
            where: eq(stacks.id, id),
            with: {
                repository: {
                    columns: { id: true, fullName: true },
                },
                branches: {
                    columns: {
                        id: true,
                        name: true,
                        position: true,
                        prNumber: true,
                        prTitle: true,
                    },
                    orderBy: [asc(branches.position)],
                },
            },
            columns: {
                id: true,
                repoId: true,
                userId: true,
            },
        });
        if (!stack) return null;

        const [maxPrNumberRow] = await db
            .select({
                maxNumber: sql<number>`coalesce(max(${pullRequests.number}), 0)`,
            })
            .from(pullRequests)
            .where(eq(pullRequests.repoId, stack.repoId));
        let nextPrNumber = Math.max(0, Number(maxPrNumberRow?.maxNumber || 0));
        let prsCreated = 0;

        for (const branch of stack.branches) {
            if (branch.prNumber) continue;

            nextPrNumber += 1;
            const prTitle = branch.prTitle || `Stack branch: ${branch.name}`;
            const prUrl = `https://example.com/pr/${nextPrNumber}`;

            const [createdPr] = await db
                .insert(pullRequests)
                .values({
                    branchId: branch.id,
                    repoId: stack.repoId,
                    authorId: stack.userId,
                    number: nextPrNumber,
                    externalId: `nexus_${stack.id}_${branch.id}_${nextPrNumber}`,
                    title: prTitle,
                    description: `Generated from stack ${stack.id}`,
                    url: prUrl,
                    status: "open",
                    isDraft: false,
                    linesAdded: 0,
                    linesRemoved: 0,
                    filesChanged: 0,
                    commitsCount: 0,
                })
                .returning({
                    number: pullRequests.number,
                    title: pullRequests.title,
                    status: pullRequests.status,
                    url: pullRequests.url,
                });

            await db
                .update(branches)
                .set({
                    prNumber: createdPr.number,
                    prTitle: createdPr.title,
                    prStatus: normalizeStatus(createdPr.status),
                    prUrl: createdPr.url,
                    updatedAt: new Date(),
                })
                .where(eq(branches.id, branch.id));

            prsCreated += 1;
        }

        await db
            .update(stacks)
            .set({ updatedAt: new Date() })
            .where(eq(stacks.id, id));

        return {
            stackId: id,
            prsCreated,
        };
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
        const [deleted] = await db
            .delete(stacks)
            .where(eq(stacks.id, id))
            .returning({ id: stacks.id });
        return Boolean(deleted);
    },
};

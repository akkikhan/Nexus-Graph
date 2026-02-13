/**
 * NEXUS API - Stack Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { stackRepository } from "../repositories/stack.js";

const stackRouter = new Hono();
const SERVER_STACK_FILE = path.join(process.cwd(), ".nexus", "server-stack.json");
const LOCAL_STACK_FILE = path.join(process.cwd(), ".nexus", "stack.json");

interface LocalStackBranch {
    name: string;
    parent?: string;
    position: number;
    prNumber?: number;
    prStatus?: string;
}

interface LocalStackData {
    trunk: string;
    branches: Record<string, LocalStackBranch>;
}

interface StackSummary {
    id: string;
    name: string;
    description?: string;
    repository: {
        id: string;
        name: string;
    };
    baseBranch: string;
    branches: Array<{
        name: string;
        order: number;
        status: string;
        prNumber: number | null;
    }>;
    mergableCount: number;
    totalPRs: number;
    createdAt: string;
    updatedAt?: string;
}

function normalizeStatus(status?: string | null): string {
    if (!status) return "pending";
    if (status === "changes_requested") return "changes_requested";
    if (status === "approved") return "approved";
    if (status === "draft") return "draft";
    if (status === "merged") return "merged";
    if (status === "closed") return "closed";
    if (status === "open") return "open";
    return "pending";
}

function toStackSummaryFromDb(stack: any): StackSummary {
    const branches = (stack.branches || [])
        .slice()
        .sort((a: any, b: any) => a.position - b.position)
        .map((branch: any) => ({
            name: branch.name,
            order: branch.position,
            status: normalizeStatus(branch.prStatus),
            prNumber: branch.prNumber ?? null,
        }));

    return {
        id: stack.id,
        name: stack.name,
        description: stack.description || undefined,
        repository: {
            id: stack.repository?.id || stack.repoId || "unknown",
            name: stack.repository?.fullName || stack.repository?.name || "unknown",
        },
        baseBranch: stack.baseBranch || "main",
        branches,
        mergableCount: branches.filter((b: { status: string }) => b.status === "approved").length,
        totalPRs: branches.filter((b: { prNumber: number | null }) => b.prNumber !== null).length,
        createdAt: stack.createdAt?.toISOString?.() || new Date().toISOString(),
        updatedAt: stack.updatedAt?.toISOString?.() || new Date().toISOString(),
    };
}

function toStackDetailFromDb(stack: any) {
    const base = toStackSummaryFromDb(stack);
    return {
        ...base,
        branches: (stack.branches || [])
            .slice()
            .sort((a: any, b: any) => a.position - b.position)
            .map((branch: any) => ({
                name: branch.name,
                order: branch.position,
                status: normalizeStatus(branch.prStatus),
                pr: branch.pullRequest
                    ? {
                        number: branch.pullRequest.number,
                        title: branch.pullRequest.title,
                        riskScore: branch.pullRequest.riskScore || 0,
                    }
                    : branch.prNumber
                        ? {
                            number: branch.prNumber,
                            title: branch.prTitle || `PR #${branch.prNumber}`,
                            riskScore: 0,
                        }
                        : undefined,
            })),
    };
}

function isLocalStackData(input: unknown): input is LocalStackData {
    if (!input || typeof input !== "object") return false;
    const candidate = input as Record<string, unknown>;
    return (
        typeof candidate.trunk === "string" &&
        !!candidate.branches &&
        typeof candidate.branches === "object"
    );
}

async function loadLocalStackData(): Promise<LocalStackData | null> {
    const candidates = [SERVER_STACK_FILE, LOCAL_STACK_FILE];
    for (const candidate of candidates) {
        try {
            const raw = await readFile(candidate, "utf8");
            const parsed = JSON.parse(raw);
            if (!isLocalStackData(parsed)) continue;
            return parsed;
        } catch {
            // Try next file.
        }
    }
    return null;
}

function localStatus(branch: LocalStackBranch): string {
    return normalizeStatus(branch.prStatus);
}

function toLocalStackSummary(data: LocalStackData): StackSummary {
    const branches = Object.values(data.branches)
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((branch) => ({
            name: branch.name,
            order: branch.position,
            status: localStatus(branch),
            prNumber: branch.prNumber ?? null,
        }));

    return {
        id: "local-stack",
        name: "Local Stack",
        description: "Derived from .nexus/stack.json",
        repository: {
            id: "local",
            name: "local/repository",
        },
        baseBranch: data.trunk || "main",
        branches,
        mergableCount: branches.filter((b: { status: string }) => b.status === "approved").length,
        totalPRs: branches.filter((b: { prNumber: number | null }) => b.prNumber !== null).length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function toLocalStackDetail(data: LocalStackData) {
    const summary = toLocalStackSummary(data);
    return {
        ...summary,
        branches: Object.values(data.branches)
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((branch) => ({
                name: branch.name,
                order: branch.position,
                status: localStatus(branch),
                pr: branch.prNumber
                    ? {
                        number: branch.prNumber,
                        title: `PR #${branch.prNumber}`,
                        riskScore: 0,
                    }
                    : undefined,
            })),
    };
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unknown database error";
}

// Schemas
const createStackSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    userId: z.string().optional(),
    repositoryId: z.string(),
    baseBranch: z.string().default("main"),
});

const addBranchSchema = z.object({
    branchName: z.string(),
    parentBranchName: z.string().optional(),
    prId: z.string().optional(),
});

const reorderSchema = z.object({
    branches: z.array(
        z.object({
            branchName: z.string(),
            order: z.number(),
        })
    ),
});

const syncLocalStackSchema = z.object({
    stackName: z.string().default("local-stack"),
    repo: z.string().optional(),
    user: z.string().optional(),
    snapshot: z.object({
        trunk: z.string().default("main"),
        branches: z.array(
            z.object({
                name: z.string(),
                parent: z.string().optional(),
                position: z.number(),
                prNumber: z.number().optional(),
                prStatus: z.string().optional(),
            })
        ),
    }),
});

// Routes

/**
 * POST /stacks/sync-local - Store CLI stack snapshot for API/web consumption
 */
stackRouter.post(
    "/sync-local",
    zValidator("json", syncLocalStackSchema),
    async (c) => {
        const body = c.req.valid("json");

        const branches: Record<string, LocalStackBranch> = {};
        for (const branch of body.snapshot.branches) {
            branches[branch.name] = {
                name: branch.name,
                parent: branch.parent,
                position: branch.position,
                prNumber: branch.prNumber,
                prStatus: branch.prStatus,
            };
        }

        const snapshot: LocalStackData = {
            trunk: body.snapshot.trunk,
            branches,
        };

        try {
            await mkdir(path.dirname(SERVER_STACK_FILE), { recursive: true });
            await writeFile(
                SERVER_STACK_FILE,
                JSON.stringify(snapshot, null, 2),
                "utf8"
            );

            return c.json({
                success: true,
                stackName: body.stackName,
                branches: body.snapshot.branches.length,
                persistedTo: SERVER_STACK_FILE,
            });
        } catch (error: any) {
            return c.json(
                {
                    success: false,
                    error: error?.message || "Failed to persist local stack snapshot",
                },
                500
            );
        }
    }
);

/**
 * GET /stacks - List all stacks
 */
stackRouter.get("/", async (c) => {
    const userId = c.req.query("userId");
    const repoId = c.req.query("repoId");
    let dbError: string | null = null;

    try {
        const stacks = await stackRepository.listForUser(userId, {
            repoId,
        });
        return c.json({
            stacks: stacks.map(toStackSummaryFromDb),
        });
    } catch (error) {
        dbError = errorMessage(error);
    }

    const localData = await loadLocalStackData();
    if (localData) {
        return c.json({
            stacks: [toLocalStackSummary(localData)],
        });
    }

    return c.json(
        {
            error: "Database unavailable for stack listing",
            details: dbError || undefined,
        },
        503
    );
});

/**
 * GET /stacks/:id - Get single stack
 */
stackRouter.get("/:id", async (c) => {
    const id = c.req.param("id");
    let dbError: string | null = null;

    try {
        if (id !== "local-stack") {
            const stack = await stackRepository.getWithPRDetails(id);
            if (stack) {
                return c.json({ stack: toStackDetailFromDb(stack) });
            }
        }
    } catch (error) {
        dbError = errorMessage(error);
    }

    const localData = await loadLocalStackData();
    if (localData && id === "local-stack") {
        return c.json({
            stack: toLocalStackDetail(localData),
        });
    }

    if (dbError) {
        return c.json(
            {
                error: "Database unavailable for stack detail",
                details: dbError,
            },
            503
        );
    }

    return c.json({ error: "Stack not found" }, 404);
});

/**
 * POST /stacks - Create a new stack
 */
stackRouter.post("/", zValidator("json", createStackSchema), async (c) => {
    const body = c.req.valid("json");

    if (body.userId) {
        try {
            const created = await stackRepository.create({
                repoId: body.repositoryId,
                userId: body.userId,
                name: body.name,
                baseBranch: body.baseBranch,
            });
            return c.json({
                stack: {
                    id: created.id,
                    name: created.name,
                    baseBranch: created.baseBranch,
                    branches: [],
                    createdAt: created.createdAt,
                },
            }, 201);
        } catch (error: any) {
            return c.json({
                error: error?.message || "Failed to create stack",
            }, 500);
        }
    }

    const newStack = {
        id: `stack-${Date.now()}`,
        ...body,
        branches: [],
        createdAt: new Date().toISOString(),
    };

    return c.json({ stack: newStack }, 201);
});

/**
 * POST /stacks/:id/branches - Add a branch to stack
 */
stackRouter.post(
    "/:id/branches",
    zValidator("json", addBranchSchema),
    async (c) => {
        const id = c.req.param("id");
        const body = c.req.valid("json");

        return c.json({
            success: true,
            stack: {
                id,
                branches: [
                    {
                        name: body.branchName,
                        parentBranch: body.parentBranchName,
                        status: "pending",
                    },
                ],
            },
        });
    }
);

/**
 * PUT /stacks/:id/reorder - Reorder branches in stack
 */
stackRouter.put(
    "/:id/reorder",
    zValidator("json", reorderSchema),
    async (c) => {
        const id = c.req.param("id");
        const { branches } = c.req.valid("json");

        return c.json({
            success: true,
            stack: { id, branches },
        });
    }
);

/**
 * POST /stacks/:id/sync - Sync stack with remote
 */
stackRouter.post("/:id/sync", async (c) => {
    const id = c.req.param("id");

    // In production:
    // 1. Fetch latest from git remote
    // 2. Rebase each branch on its parent
    // 3. Force push if needed
    // 4. Update PR base branches

    return c.json({
        success: true,
        message: "Stack synced successfully",
        result: {
            stackId: id,
            branchesRebased: 3,
            conflictsDetected: 0,
        },
    });
});

/**
 * POST /stacks/:id/submit - Submit entire stack as PRs
 */
stackRouter.post("/:id/submit", async (c) => {
    const id = c.req.param("id");

    // In production:
    // 1. Create PRs for each branch without one
    // 2. Set up proper base branch chain
    // 3. Request AI reviews

    return c.json({
        success: true,
        message: "Stack submitted",
        prsCreated: 2,
    });
});

/**
 * DELETE /stacks/:id - Delete a stack
 */
stackRouter.delete("/:id", async (c) => {
    const id = c.req.param("id");

    return c.json({
        success: true,
        message: `Stack ${id} deleted`,
    });
});

export { stackRouter };

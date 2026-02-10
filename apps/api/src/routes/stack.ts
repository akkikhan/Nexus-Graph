/**
 * NEXUS API - Stack Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const stackRouter = new Hono();

// Schemas
const createStackSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
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

// Routes

/**
 * GET /stacks - List all stacks
 */
stackRouter.get("/", async (c) => {
    // In production, query database

    const mockStacks = [
        {
            id: "stack-1",
            name: "auth-feature",
            description: "Complete authentication flow",
            repository: { id: "repo-1", name: "nexus/platform" },
            baseBranch: "main",
            branches: [
                {
                    name: "feature/auth-base",
                    order: 0,
                    status: "merged",
                    prNumber: 120,
                },
                {
                    name: "feature/auth-github",
                    order: 1,
                    status: "approved",
                    prNumber: 121,
                },
                {
                    name: "feature/auth-gitlab",
                    order: 2,
                    status: "in_review",
                    prNumber: 122,
                },
                {
                    name: "feature/auth-ui",
                    order: 3,
                    status: "draft",
                    prNumber: null,
                },
            ],
            mergableCount: 1,
            totalPRs: 3,
            createdAt: new Date().toISOString(),
        },
        {
            id: "stack-2",
            name: "billing-refactor",
            repository: { id: "repo-2", name: "nexus/billing" },
            baseBranch: "main",
            branches: [
                {
                    name: "refactor/billing-v2",
                    order: 0,
                    status: "in_review",
                    prNumber: 89,
                },
                {
                    name: "refactor/billing-stripe",
                    order: 1,
                    status: "pending",
                    prNumber: 90,
                },
            ],
            mergableCount: 0,
            totalPRs: 2,
            createdAt: new Date().toISOString(),
        },
    ];

    return c.json({ stacks: mockStacks });
});

/**
 * GET /stacks/:id - Get single stack
 */
stackRouter.get("/:id", async (c) => {
    const id = c.req.param("id");

    const mockStack = {
        id,
        name: "auth-feature",
        description: "Complete authentication flow",
        repository: { id: "repo-1", name: "nexus/platform" },
        baseBranch: "main",
        branches: [
            {
                name: "feature/auth-base",
                order: 0,
                status: "merged",
                pr: {
                    number: 120,
                    title: "Add auth base structure",
                    riskScore: 35,
                },
            },
            {
                name: "feature/auth-github",
                order: 1,
                status: "approved",
                pr: {
                    number: 121,
                    title: "Implement GitHub OAuth",
                    riskScore: 55,
                },
            },
            {
                name: "feature/auth-gitlab",
                order: 2,
                status: "in_review",
                pr: {
                    number: 122,
                    title: "Implement GitLab OAuth",
                    riskScore: 48,
                },
            },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    return c.json({ stack: mockStack });
});

/**
 * POST /stacks - Create a new stack
 */
stackRouter.post("/", zValidator("json", createStackSchema), async (c) => {
    const body = c.req.valid("json");

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

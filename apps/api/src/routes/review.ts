/**
 * NEXUS API - Review Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { reviewRepository } from "../repositories/review.js";

const reviewRouter = new Hono();

// Schemas
const createReviewSchema = z.object({
    prId: z.string(),
    action: z.enum(["approve", "request_changes", "comment"]),
    body: z.string().optional(),
    userId: z.string().optional(),
    comments: z
        .array(
            z.object({
                path: z.string(),
                line: z.number(),
                body: z.string(),
                side: z.enum(["LEFT", "RIGHT"]).optional(),
            })
        )
        .optional(),
});

const commentSchema = z.object({
    prId: z.string(),
    body: z.string(),
    path: z.string().optional(),
    line: z.number().optional(),
    side: z.enum(["LEFT", "RIGHT"]).optional(),
    userId: z.string().optional(),
    replyTo: z.string().optional(),
});

const pendingSchema = z.object({
    limit: z.coerce.number().min(1).max(100).default(20),
});

function details(error: unknown): string {
    return reviewRepository.errorMessage(error);
}

/**
 * GET /reviews/pr/:prId - Get reviews for a PR
 */
reviewRouter.get("/pr/:prId", async (c) => {
    const prId = c.req.param("prId");
    try {
        const reviews = await reviewRepository.listByPR(prId);
        return c.json({ reviews });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for review listing",
                details: details(error),
            },
            503
        );
    }
});

/**
 * POST /reviews - Submit a review
 */
reviewRouter.post("/", zValidator("json", createReviewSchema), async (c) => {
    const body = c.req.valid("json");

    try {
        const prExists = await reviewRepository.pullRequestExists(body.prId);
        if (!prExists) {
            return c.json({ error: "Pull request not found" }, 404);
        }

        const review = await reviewRepository.create(body);
        if (!review) {
            return c.json({ error: "Failed to create review" }, 500);
        }
        return c.json({ review }, 201);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for review creation",
                details: details(error),
            },
            503
        );
    }
});

/**
 * POST /reviews/comment - Add inline comment
 */
reviewRouter.post("/comment", zValidator("json", commentSchema), async (c) => {
    const body = c.req.valid("json");

    try {
        const prExists = await reviewRepository.pullRequestExists(body.prId);
        if (!prExists) {
            return c.json({ error: "Pull request not found" }, 404);
        }

        const comment = await reviewRepository.addComment(body);
        if (!comment) {
            return c.json({ error: "Failed to create comment" }, 500);
        }
        return c.json({ comment }, 201);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for comment creation",
                details: details(error),
            },
            503
        );
    }
});

/**
 * POST /reviews/:id/resolve - Resolve a comment thread
 */
reviewRouter.post("/:id/resolve", async (c) => {
    const id = c.req.param("id");

    try {
        const comment = await reviewRepository.resolveComment(id);
        if (!comment) {
            return c.json({ error: "Comment not found" }, 404);
        }
        return c.json({
            success: true,
            comment,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for comment resolution",
                details: details(error),
            },
            503
        );
    }
});

/**
 * GET /reviews/pending - Get PRs awaiting your review
 */
reviewRouter.get("/pending", zValidator("query", pendingSchema), async (c) => {
    const query = c.req.valid("query");

    try {
        const pending = await reviewRepository.pending(query.limit);
        return c.json({ pending });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for pending reviews",
                details: details(error),
            },
            503
        );
    }
});

export { reviewRouter };


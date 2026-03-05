/**
 * NEXUS API - Insights Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createNexusAI } from "@nexus/ai";
import { insightsRepository } from "../repositories/insights.js";

const insightsRouter = new Hono();

const nexusAI = createNexusAI({
    providers: {
        anthropic: {
            apiKey: process.env.ANTHROPIC_API_KEY || "",
            model: "claude-3-5-sonnet-20241022",
        },
        openai: {
            apiKey: process.env.OPENAI_API_KEY || "",
            model: "gpt-4-turbo-preview",
        },
        google: {
            apiKey: process.env.GOOGLE_AI_API_KEY || "",
            model: "gemini-pro",
        },
    },
    defaultProvider: "anthropic",
    routing: {
        codeReview: "anthropic",
        summarization: "openai",
        suggestions: "anthropic",
        riskAssessment: "anthropic",
    },
});

const conflictPredictionSchema = z.object({
    repositoryId: z.string(),
    branch: z.string(),
});

const fatigueSchema = z.object({
    reviewerId: z.string(),
});

const velocitySchema = z.object({
    repositoryId: z.string().optional(),
    teamId: z.string().optional(),
    period: z.enum(["day", "week", "sprint", "month"]).default("week"),
});

function details(error: unknown): string {
    return insightsRepository.errorMessage(error);
}

/**
 * GET /insights/dashboard - Main insights dashboard data
 */
insightsRouter.get("/dashboard", async (c) => {
    const repositoryId = c.req.query("repositoryId");
    try {
        const dashboard = await insightsRepository.dashboard(repositoryId || undefined);
        return c.json(dashboard);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for insights dashboard",
                details: details(error),
            },
            503
        );
    }
});

/**
 * POST /insights/predict-conflicts - Predict merge conflicts
 */
insightsRouter.post(
    "/predict-conflicts",
    zValidator("json", conflictPredictionSchema),
    async (c) => {
        const body = c.req.valid("json");
        try {
            const prediction = await insightsRepository.predictConflicts(body);
            return c.json(prediction);
        } catch (error) {
            return c.json(
                {
                    error: "Database unavailable for conflict prediction",
                    details: details(error),
                },
                503
            );
        }
    }
);

/**
 * POST /insights/reviewer-fatigue - Analyze reviewer fatigue
 */
insightsRouter.post(
    "/reviewer-fatigue",
    zValidator("json", fatigueSchema),
    async (c) => {
        const { reviewerId } = c.req.valid("json");

        try {
            const sessionData = await insightsRepository.reviewerSession(reviewerId);
            const analysis = nexusAI.flowAnalyzer.analyzeFlowState(sessionData.session);

            return c.json({
                reviewerId,
                session: {
                    reviewer: sessionData.session.username,
                    startTime: sessionData.summary.startTime,
                    reviewCount: sessionData.summary.reviewCount,
                    avgReviewDuration: sessionData.summary.avgReviewDuration,
                    avgCommentLength: sessionData.summary.avgCommentLength,
                    approvalRate: sessionData.summary.approvalRate,
                },
                analysis,
                recommendation:
                    analysis.suggestedAction === "take_break"
                        ? "Reviewer should take a break before continuing"
                        : analysis.suggestedAction === "reassign"
                            ? "Consider reassigning remaining PRs"
                            : analysis.suggestedAction === "stop_reviewing"
                                ? "Reviewer should pause reviews and resume later"
                                : "Reviewer is in good flow state",
            });
        } catch (error) {
            return c.json(
                {
                    error: "Database unavailable for reviewer fatigue analysis",
                    details: details(error),
                },
                503
            );
        }
    }
);

/**
 * GET /insights/velocity - Team/repo velocity metrics
 */
insightsRouter.get("/velocity", zValidator("query", velocitySchema), async (c) => {
    const query = c.req.valid("query");
    try {
        const metrics = await insightsRepository.velocity(query);
        return c.json(metrics);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for velocity metrics",
                details: details(error),
            },
            503
        );
    }
});

/**
 * GET /insights/code-health - Codebase health metrics
 */
insightsRouter.get("/code-health", async (c) => {
    const repositoryId = c.req.query("repositoryId");
    try {
        const health = await insightsRepository.codeHealth(repositoryId || undefined);
        return c.json(health);
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for code health metrics",
                details: details(error),
            },
            503
        );
    }
});

/**
 * GET /insights/optimal-reviewers - Get optimal reviewers for a PR
 */
insightsRouter.get("/optimal-reviewers", async (c) => {
    const prId = c.req.query("prId");
    const files = c.req.query("files")?.split(",").map((value) => value.trim()).filter(Boolean) || [];

    try {
        const input = await insightsRepository.optimalReviewerInputs(prId || undefined, files);
        const scored = nexusAI.flowAnalyzer.scoreReviewers(input.prContext, input.candidates);
        type ReviewerScore = {
            userId: string;
            username: string;
            overallScore: number;
            reasoning: string[];
        };

        const candidateById = new Map(input.candidates.map((candidate) => [candidate.userId, candidate]));
        const recommendations = scored.slice(0, 3).map((score: ReviewerScore) => {
            const candidate = candidateById.get(score.userId);
            const currentLoad = candidate?.currentWorkload ?? 0;
            return {
                username: score.username,
                score: score.overallScore,
                reasons: score.reasoning.length > 0 ? score.reasoning : ["Balanced candidate profile"],
                availability: currentLoad >= 6 ? "limited" : "available",
                currentLoad,
            };
        });

        return c.json({
            prId: input.metadata.prId || prId || null,
            files: input.prContext.files,
            recommendations,
        });
    } catch (error) {
        return c.json(
            {
                error: "Database unavailable for reviewer recommendations",
                details: details(error),
            },
            503
        );
    }
});

export { insightsRouter };

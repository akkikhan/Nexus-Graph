/**
 * NEXUS API - AI Routes
 * 10X AI Features Exposed via API
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createNexusAI, type DiffContext } from "@nexus/ai";

const aiRouter = new Hono();

function hasKey(key?: string) {
    return typeof key === "string" && key.trim().length > 0;
}

// Prefer a provider that is actually configured. This makes single-provider
// setups (for example only GOOGLE_AI_API_KEY) work out of the box.
const hasAnthropic = hasKey(process.env.ANTHROPIC_API_KEY);
const hasOpenAI = hasKey(process.env.OPENAI_API_KEY);
const hasGoogle = hasKey(process.env.GOOGLE_AI_API_KEY);

const defaultProvider = hasAnthropic
    ? "anthropic"
    : hasOpenAI
      ? "openai"
      : hasGoogle
        ? "google"
        : "anthropic";

// Initialize NEXUS AI (in production, this would be configured per-org)
const nexusAI = createNexusAI({
    providers: {
        anthropic: {
            apiKey: process.env.ANTHROPIC_API_KEY || "",
            model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
        },
        openai: {
            apiKey: process.env.OPENAI_API_KEY || "",
            model: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
        },
        google: {
            apiKey: process.env.GOOGLE_AI_API_KEY || "",
            model: process.env.GOOGLE_AI_MODEL || "gemini-pro",
        }
    },
    defaultProvider,
    routing: {
        codeReview: hasAnthropic ? "anthropic" : defaultProvider,
        summarization: hasOpenAI ? "openai" : defaultProvider,
        suggestions: hasAnthropic ? "anthropic" : defaultProvider,
        riskAssessment: hasAnthropic ? "anthropic" : defaultProvider,
    }
});

// Helper to ensure DiffContext compliance
const toDiffContext = (
    f: { file: string; diff: string; language?: string }
): DiffContext => ({
    file: f.file,
    diff: f.diff,
    additions: 0,
    deletions: 0,
    patch: "",
});

// Schemas
const reviewSchema = z.object({
    files: z.array(
        z.object({
            file: z.string(),
            diff: z.string(),
            language: z.string().optional(),
        })
    ),
    context: z
        .object({
            prTitle: z.string().optional(),
            prDescription: z.string().optional(),
            authorExperience: z.number().optional(),
        })
        .optional(),
});

const routingSchema = z.object({
    files: z.array(
        z.object({
            file: z.string(),
            diff: z.string(),
        })
    ),
    primaryLanguage: z.string(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    prType: z.enum([
        "feature",
        "bugfix",
        "refactor",
        "docs",
        "security",
        "infra",
    ]),
    reviewType: z
        .enum(["full", "quick", "security_focused", "performance_focused"])
        .default("full"),
    maxLatencyMs: z.number().optional(),
    maxCostCents: z.number().optional(),
});

const debateSchema = z.object({
    diff: z.object({
        file: z.string(),
        diff: z.string(),
    }),
    models: z.object({
        asserter: z.enum(["anthropic", "openai", "google"]),
        challenger: z.enum(["anthropic", "openai", "google"]),
        resolver: z.enum(["anthropic", "openai", "google"]).optional(),
    }),
});

const intentSchema = z.object({
    files: z.array(
        z.object({
            file: z.string(),
            diff: z.string(),
        })
    ),
});

const healthSchema = z.object({
    beforeFiles: z.array(
        z.object({
            path: z.string(),
            content: z.string(),
        })
    ),
    afterFiles: z.array(
        z.object({
            path: z.string(),
            content: z.string(),
        })
    ),
    testFiles: z
        .array(
            z.object({
                path: z.string(),
                content: z.string(),
            })
        )
        .optional(),
});

const testGenSchema = z.object({
    code: z.string(),
    targetFile: z.string(),
    functions: z.array(z.string()),
    framework: z.enum(["jest", "vitest", "mocha", "playwright"]).optional(),
});

const impactSchema = z.object({
    files: z.array(
        z.object({
            file: z.string(),
            diff: z.string(),
        })
    ),
    userLoad: z.enum(["low", "medium", "high", "peak"]).optional(),
});

// Routes

/**
 * POST /ai/route - Get optimal AI model for the task
 */
aiRouter.post("/route", zValidator("json", routingSchema), async (c) => {
    const body = c.req.valid("json");

    try {
        const decision = await nexusAI.modelRouter.route({
            files: body.files.map(toDiffContext),
            primaryLanguage: body.primaryLanguage,
            totalTokens: body.files.reduce((sum, f) => sum + f.diff.length / 4, 0),
            riskLevel: body.riskLevel,
            prType: body.prType,
            reviewType: body.reviewType,
            maxLatencyMs: body.maxLatencyMs,
            maxCostCents: body.maxCostCents,
        });

        return c.json({
            success: true,
            routing: decision,
        });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * POST /ai/review - AI code review
 */
aiRouter.post("/review", zValidator("json", reviewSchema), async (c) => {
    const body = c.req.valid("json");

    try {
        const comments = await nexusAI.codeReviewer.reviewPR(body.files.map(toDiffContext));

        return c.json({
            success: true,
            comments,
            summary: {
                total: comments.length,
                bySeverity: {
                    critical: comments.filter((c: any) => c.severity === "critical").length,
                    error: comments.filter((c: any) => c.severity === "error").length,
                    warning: comments.filter((c: any) => c.severity === "warning").length,
                    info: comments.filter((c: any) => c.severity === "info").length,
                },
            },
        });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * POST /ai/debate - AI Ensemble Debate
 */
aiRouter.post("/debate", zValidator("json", debateSchema), async (c) => {
    const body = c.req.valid("json");

    try {
        const result = await nexusAI.ensembleDebate.debate(toDiffContext(body.diff), body.models);

        return c.json({
            success: true,
            debate: result,
        });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * POST /ai/intent - Code Intent Detection
 */
aiRouter.post("/intent", zValidator("json", intentSchema), async (c) => {
    const body = c.req.valid("json");

    try {
        const analysis = await nexusAI.intentDetector.analyze(body.files.map(toDiffContext));

        return c.json({
            success: true,
            intent: analysis,
        });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * POST /ai/risk - Risk scoring
 */
aiRouter.post("/risk", zValidator("json", reviewSchema), async (c) => {
    const body = c.req.valid("json");

    try {
        // Calculate risk for the whole PR using assessRisk
        const riskScore = await nexusAI.riskScorer.assessRisk(
            body.files.map(toDiffContext),
            {
                linesAdded: 0, // Mock metrics for now
                linesRemoved: 0,
                filesChanged: body.files.length,
                testFilesChanged: 0
            }
        );

        return c.json({
            success: true,
            overallScore: riskScore.score,
            overallLevel: riskScore.level,
            risk: riskScore,
            files: [] // Backwards compatibility: empty list since we have a single PR score now
        });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * POST /ai/health - Code Health Impact Analysis
 */
aiRouter.post("/health", zValidator("json", healthSchema), async (c) => {
    const body = c.req.valid("json");

    try {
        const impact = nexusAI.healthScorer.analyzeImpact(
            body.beforeFiles,
            body.afterFiles,
            body.testFiles
        );

        return c.json({
            success: true,
            health: impact,
        });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * POST /ai/generate-tests - Smart Test Generation
 */
aiRouter.post("/generate-tests", zValidator("json", testGenSchema), async (c) => {
    const body = c.req.valid("json");

    try {
        const tests = await nexusAI.testGenerator.generateTests(body.code, {
            targetFile: body.targetFile,
            functions: body.functions,
            framework: body.framework,
        });

        return c.json({
            success: true,
            tests,
        });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * POST /ai/simulate-impact - Production Impact Simulation
 */
aiRouter.post("/simulate-impact", zValidator("json", impactSchema), async (c) => {
    const body = c.req.valid("json");

    try {
        const simulation = nexusAI.impactSimulator.simulate(body.files.map(toDiffContext), {
            userLoad: body.userLoad,
        });

        return c.json({
            success: true,
            simulation,
        });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * POST /ai/split - Auto-split large PR
 */
aiRouter.post("/split", zValidator("json", intentSchema), async (c) => {
    const body = c.req.valid("json");

    try {
        const suggestions = await nexusAI.autoSplitter.suggestSplits(body.files.map(toDiffContext));

        return c.json({
            success: true,
            splits: suggestions,
        });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

export { aiRouter };

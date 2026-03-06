import { createNexusAI, type AIConfig, type DiffContext, type ReviewComment } from "@nexus/ai";
import type { SimpleGit } from "simple-git";
import { getConfig } from "./config";
import { getDiff, getFilesChanged } from "./git";

type SupportedProvider = "anthropic" | "openai" | "google";

type ReviewRule = {
    category: ReviewComment["category"];
    severity: ReviewComment["severity"];
    message: string;
    suggestion: string;
    pattern: RegExp;
};

const DEFAULT_PROVIDER: SupportedProvider = "anthropic";
const DEFAULT_MODELS: Record<SupportedProvider, string> = {
    anthropic: "claude-sonnet-4-20250514",
    openai: "gpt-4o",
    google: "gemini-1.5-pro",
};

const REVIEW_RULES: ReviewRule[] = [
    {
        category: "security",
        severity: "critical",
        message: "Hard-coded secret-like value added in the diff.",
        suggestion: "Move the secret into environment configuration or secret storage.",
        pattern: /(?:password|secret|token|api[_-]?key)\s*[:=]\s*["'`][^"'`\s]{4,}/i,
    },
    {
        category: "security",
        severity: "error",
        message: "Raw SQL appears to be assembled with interpolation.",
        suggestion: "Use parameterized queries or a query builder instead of interpolated SQL.",
        pattern: /(?:SELECT|INSERT|UPDATE|DELETE)\b[^\n]*\$\{/i,
    },
    {
        category: "security",
        severity: "warning",
        message: "Direct HTML injection API detected.",
        suggestion: "Avoid unsafe HTML injection or sanitize the content before rendering.",
        pattern: /dangerouslySetInnerHTML|innerHTML\s*=/i,
    },
    {
        category: "best_practice",
        severity: "info",
        message: "Debug-only statement left in the diff.",
        suggestion: "Remove debugger and console logging before merge unless it is intentional telemetry.",
        pattern: /\bconsole\.(log|debug|trace)\b|\bdebugger\b/,
    },
];

export type ReviewAnalysisResult = {
    comments: ReviewComment[];
    modeLabel: string;
};

export function createCliAI() {
    const config = getConfig();
    const provider = resolveProvider(config.get("aiProvider") as string | undefined);
    const model = resolveModel(provider, config.get("aiModel") as string | undefined);
    const apiKey = resolveApiKey(provider, config.get("aiApiKey") as string | undefined);

    const providers: AIConfig["providers"] = {};
    if (apiKey) {
        if (provider === "anthropic") {
            providers.anthropic = { apiKey, model };
        } else if (provider === "openai") {
            providers.openai = { apiKey, model };
        } else if (provider === "google") {
            providers.google = { apiKey, model };
        }
    }

    const aiConfig: AIConfig = {
        providers,
        defaultProvider: provider,
        routing: {
            codeReview: provider,
            summarization: provider,
            suggestions: provider,
            riskAssessment: provider,
        },
    };

    return {
        ai: createNexusAI(aiConfig),
        hasProvider: Boolean(apiKey),
        provider,
        model,
    };
}

export async function collectDiffContexts(
    git: SimpleGit,
    base: string,
    head: string,
    file?: string
): Promise<DiffContext[]> {
    const changedFiles = file ? [file] : await getFilesChanged(git, base, head);
    if (changedFiles.length === 0) return [];

    const summary = await git.diffSummary([base, head]);
    const statsByFile = new Map(
        (summary.files || []).map((entry) => [normalizePath(entry.file), entry])
    );

    const contexts: DiffContext[] = [];
    for (const changedFile of changedFiles) {
        const diff = await getDiff(git, base, head, changedFile);
        if (!diff.trim()) continue;

        const stats = statsByFile.get(normalizePath(changedFile));
        const additions = stats && "insertions" in stats && typeof stats.insertions === "number"
            ? stats.insertions
            : 0;
        const deletions = stats && "deletions" in stats && typeof stats.deletions === "number"
            ? stats.deletions
            : 0;
        contexts.push({
            file: normalizePath(changedFile),
            diff,
            patch: diff,
            additions,
            deletions,
        });
    }

    return contexts;
}

export async function runReviewAnalysis(
    diffs: DiffContext[],
    repoName: string
): Promise<ReviewAnalysisResult> {
    const client = createCliAI();

    if (client.hasProvider) {
        try {
            const comments = await client.ai.codeReviewer.reviewPR(diffs, {
                repoName,
                relevantFiles: [],
            });
            return {
                comments,
                modeLabel: `${client.provider}/${client.model}`,
            };
        } catch {
            // Fall through to deterministic heuristics.
        }
    }

    return {
        comments: buildHeuristicReview(diffs),
        modeLabel: "heuristic fallback",
    };
}

export function formatReviewSummary(comments: ReviewComment[]) {
    return comments.reduce(
        (summary, comment) => {
            summary.total += 1;
            if (comment.severity === "critical") summary.critical += 1;
            if (comment.severity === "error") summary.errors += 1;
            if (comment.severity === "warning") summary.warnings += 1;
            if (comment.severity === "info") summary.infos += 1;
            return summary;
        },
        { critical: 0, errors: 0, warnings: 0, infos: 0, total: 0 }
    );
}

export function formatReviewCommentBody(
    result: ReviewAnalysisResult,
    baseBranch: string,
    headBranch: string
): string {
    const summary = formatReviewSummary(result.comments);
    const lines = [
        "## Nexus Review",
        `Mode: ${result.modeLabel}`,
        `Scope: \`${baseBranch}\` -> \`${headBranch}\``,
        "",
    ];

    if (result.comments.length === 0) {
        lines.push("No material issues found in this diff.");
        return lines.join("\n");
    }

    lines.push(
        `Findings: ${summary.critical} critical, ${summary.errors} errors, ${summary.warnings} warnings, ${summary.infos} info.`,
        ""
    );

    for (const comment of result.comments.slice(0, 10)) {
        const location = `${comment.filePath}:${comment.lineNumber}`;
        const suggestion = comment.suggestionCode
            ? ` Suggestion: ${truncate(comment.suggestionCode.replace(/\s+/g, " "), 160)}`
            : "";
        lines.push(`- **${comment.severity.toUpperCase()}** \`${location}\` - ${comment.body}${suggestion}`);
    }

    if (result.comments.length > 10) {
        lines.push(`- ...and ${result.comments.length - 10} more findings.`);
    }

    return lines.join("\n");
}

function resolveProvider(input?: string): SupportedProvider {
    const normalized = String(input || process.env.NEXUS_AI_PROVIDER || DEFAULT_PROVIDER)
        .trim()
        .toLowerCase();

    if (normalized === "openai" || normalized === "google" || normalized === "anthropic") {
        return normalized;
    }

    return DEFAULT_PROVIDER;
}

function resolveModel(provider: SupportedProvider, configuredModel?: string): string {
    const normalized = String(configuredModel || process.env.NEXUS_AI_MODEL || "").trim();
    return normalized || DEFAULT_MODELS[provider];
}

function resolveApiKey(provider: SupportedProvider, configuredKey?: string): string {
    const direct = String(configuredKey || "").trim();
    if (direct) return direct;

    if (provider === "anthropic") return String(process.env.ANTHROPIC_API_KEY || "").trim();
    if (provider === "openai") return String(process.env.OPENAI_API_KEY || "").trim();
    return String(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "").trim();
}

function buildHeuristicReview(diffs: DiffContext[]): ReviewComment[] {
    const comments: ReviewComment[] = [];

    for (const diff of diffs) {
        comments.push(...scanDiffWithRules(diff));
    }

    return comments.slice(0, 20);
}

function scanDiffWithRules(diff: DiffContext): ReviewComment[] {
    const comments: ReviewComment[] = [];
    const lines = diff.patch.split(/\r?\n/);
    let fileLine = 0;

    for (const line of lines) {
        const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (hunkMatch) {
            fileLine = Number(hunkMatch[1]) - 1;
            continue;
        }

        if (line.startsWith("+++") || line.startsWith("---")) continue;

        if (line.startsWith("+")) {
            fileLine += 1;
            const content = line.slice(1);

            for (const rule of REVIEW_RULES) {
                if (!rule.pattern.test(content)) continue;

                comments.push({
                    id: `heuristic-${diff.file}-${fileLine}-${comments.length}`,
                    filePath: diff.file,
                    lineNumber: fileLine,
                    side: "RIGHT",
                    body: rule.message,
                    suggestionCode: rule.suggestion,
                    category: rule.category,
                    severity: rule.severity,
                    confidence: 0.55,
                });
            }

            continue;
        }

        if (line.startsWith("-")) continue;
        fileLine += 1;
    }

    return comments;
}

function normalizePath(file: string): string {
    return file.replaceAll("\\", "/");
}

function truncate(value: string, limit: number): string {
    if (value.length <= limit) return value;
    return `${value.slice(0, limit - 3)}...`;
}


/**
 * NEXUS AI Code Review Engine
 * Analyzes diffs and provides intelligent code review comments
 */
const CODE_REVIEW_SYSTEM_PROMPT = `You are NEXUS, an expert code reviewer with deep knowledge across all programming languages, frameworks, and best practices.

Your goal is to provide HIGH-SIGNAL, actionable feedback that catches REAL issues:
- Logic errors and bugs that could cause runtime failures
- Security vulnerabilities (SQL injection, XSS, auth bypasses)
- Performance issues (N+1 queries, memory leaks, inefficient algorithms)
- Missing error handling and edge cases
- Breaking changes to public APIs

DO NOT comment on:
- Minor style preferences (leave that to linters)
- Simple typos (unless they cause bugs)
- Things that are obviously intentional design choices

For each issue found, provide:
1. The exact file and line number
2. A clear explanation of the problem
3. A suggested fix with actual code

Format your response as JSON array of comments.`;
const CODE_REVIEW_USER_PROMPT = `Review the following code changes and identify any issues:

## Diff
\`\`\`diff
{diff}
\`\`\`

## File Context
File: {file}
Lines added: {additions}
Lines removed: {deletions}

{customRules}

Respond with a JSON array of review comments. Each comment should have:
- filePath: string
- lineNumber: number
- body: string (explanation)
- suggestionCode: string | null (fix if applicable)
- category: "bug" | "logic_error" | "security" | "performance" | "style" | "documentation" | "testing" | "best_practice" | "refactoring"
- severity: "info" | "warning" | "error" | "critical"
- confidence: number (0-1)

If no issues found, return an empty array: []`;
export class CodeReviewer {
    orchestrator;
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
    }
    /**
     * Review a code diff and return comments
     */
    async reviewDiff(diffContext, codebaseContext) {
        const customRulesSection = codebaseContext?.customRules?.length
            ? `## Custom Rules\n${codebaseContext.customRules.join("\n")}`
            : "";
        const prompt = CODE_REVIEW_USER_PROMPT
            .replace("{diff}", diffContext.diff)
            .replace("{file}", diffContext.file)
            .replace("{additions}", String(diffContext.additions))
            .replace("{deletions}", String(diffContext.deletions))
            .replace("{customRules}", customRulesSection);
        const provider = this.orchestrator.getProviderForTask("codeReview");
        const response = await this.orchestrator.chat([{ role: "user", content: prompt }], {
            provider,
            systemPrompt: CODE_REVIEW_SYSTEM_PROMPT,
            maxTokens: 4096,
            temperature: 0.2, // Low temperature for consistent reviews
        });
        return this.parseReviewResponse(response);
    }
    /**
     * Review multiple diffs (full PR)
     */
    async reviewPR(diffs, codebaseContext) {
        const allComments = [];
        // Review each file in parallel for speed
        const reviewPromises = diffs.map((diff) => this.reviewDiff(diff, codebaseContext));
        const results = await Promise.allSettled(reviewPromises);
        for (const result of results) {
            if (result.status === "fulfilled") {
                allComments.push(...result.value);
            }
        }
        // Sort by severity and confidence
        return this.sortComments(allComments);
    }
    /**
     * Parse AI response into structured comments
     */
    parseReviewResponse(response) {
        try {
            // Extract JSON from response (may have markdown code blocks)
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch)
                return [];
            const parsed = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed))
                return [];
            return parsed.map((item, index) => ({
                id: `review-${Date.now()}-${index}`,
                filePath: item.filePath || "",
                lineNumber: item.lineNumber || 1,
                endLineNumber: item.endLineNumber,
                side: "RIGHT",
                body: item.body || "",
                suggestionCode: item.suggestionCode || undefined,
                category: this.validateCategory(item.category),
                severity: this.validateSeverity(item.severity),
                confidence: Math.min(1, Math.max(0, item.confidence || 0.5)),
            }));
        }
        catch {
            console.error("Failed to parse AI review response");
            return [];
        }
    }
    validateCategory(category) {
        const valid = [
            "bug",
            "logic_error",
            "security",
            "performance",
            "style",
            "documentation",
            "testing",
            "best_practice",
            "refactoring",
        ];
        return valid.includes(category)
            ? category
            : "best_practice";
    }
    validateSeverity(severity) {
        const valid = ["info", "warning", "error", "critical"];
        return valid.includes(severity)
            ? severity
            : "warning";
    }
    sortComments(comments) {
        const severityOrder = {
            critical: 0,
            error: 1,
            warning: 2,
            info: 3,
        };
        return comments.sort((a, b) => {
            // First by severity
            const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
            if (severityDiff !== 0)
                return severityDiff;
            // Then by confidence
            return b.confidence - a.confidence;
        });
    }
}
//# sourceMappingURL=code-reviewer.js.map
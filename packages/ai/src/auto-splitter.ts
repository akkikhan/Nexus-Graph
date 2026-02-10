/**
 * NEXUS AI Auto-Split Engine
 * Intelligently suggests how to split large PRs into stacked changes
 */

import { AIOrchestrator } from "./orchestrator";
import type { SplitSuggestion, DiffContext } from "./types";

const AUTO_SPLIT_SYSTEM_PROMPT = `You are an expert at organizing code changes into logical, reviewable pull requests.

Your job is to analyze a large set of changes and suggest how to split them into smaller, focused PRs that can be stacked (merged in order).

Principles for good splits:
1. Each PR should have a single clear purpose
2. Database/schema changes should come first
3. Backend API changes should come before frontend
4. Test files can be grouped with their implementation
5. Refactors should be separate from feature work
6. Each PR should be independently reviewable (compiles, tests pass)

Consider dependencies - some changes must land before others.`;

const AUTO_SPLIT_USER_PROMPT = `Analyze these code changes and suggest how to split them into a stack of smaller PRs:

## Files Changed
{fileList}

## Full Diff
\`\`\`diff
{diff}
\`\`\`

Suggest 2-6 focused PRs that form a logical stack. Respond with JSON:
[
  {
    "name": "Add user table migration",
    "description": "Database schema changes for user authentication",
    "files": ["migrations/001_users.sql", "models/user.ts"],
    "estimatedLines": 150,
    "dependencies": [],
    "position": 1
  },
  {
    "name": "Implement auth API",
    "description": "REST endpoints for login/logout",
    "files": ["api/auth.ts", "services/auth-service.ts"],
    "estimatedLines": 300,
    "dependencies": ["Add user table migration"],
    "position": 2
  }
]

Order by position (1 = bottom of stack, lands first).`;

export class AutoSplitter {
    private orchestrator: AIOrchestrator;

    constructor(orchestrator: AIOrchestrator) {
        this.orchestrator = orchestrator;
    }

    /**
     * Analyze a large PR and suggest how to split it
     */
    async suggestSplits(diffs: DiffContext[]): Promise<SplitSuggestion[]> {
        // If PR is already small, no split needed
        const totalLines = diffs.reduce(
            (sum, d) => sum + d.additions + d.deletions,
            0
        );

        if (totalLines < 150) {
            return []; // No split needed
        }

        const fileList = diffs.map((d) => `- ${d.file} (+${d.additions}/-${d.deletions})`).join("\n");

        const combinedDiff = diffs
            .map((d) => `=== ${d.file} ===\n${d.diff}`)
            .join("\n\n");

        // Truncate if too large
        const truncatedDiff = combinedDiff.slice(0, 40000);

        const prompt = AUTO_SPLIT_USER_PROMPT
            .replace("{fileList}", fileList)
            .replace("{diff}", truncatedDiff);

        try {
            const response = await this.orchestrator.chat(
                [{ role: "user", content: prompt }],
                {
                    provider: this.orchestrator.getProviderForTask("suggestions"),
                    systemPrompt: AUTO_SPLIT_SYSTEM_PROMPT,
                    maxTokens: 4096,
                    temperature: 0.3,
                }
            );

            return this.parseSplitResponse(response);
        } catch (error) {
            console.error("Auto-split analysis failed:", error);
            return this.fallbackSplit(diffs);
        }
    }

    /**
     * Parse AI response into structured split suggestions
     */
    private parseSplitResponse(response: string): SplitSuggestion[] {
        try {
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) return [];

            const parsed = JSON.parse(jsonMatch[0]);

            if (!Array.isArray(parsed)) return [];

            return parsed.map((item) => ({
                name: item.name || "Untitled split",
                description: item.description || "",
                files: Array.isArray(item.files) ? item.files : [],
                estimatedLines: item.estimatedLines || 0,
                dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
                position: item.position || 1,
            }));
        } catch {
            return [];
        }
    }

    /**
     * Fallback heuristic-based splitting when AI fails
     */
    private fallbackSplit(diffs: DiffContext[]): SplitSuggestion[] {
        const suggestions: SplitSuggestion[] = [];

        // Group files by type
        const migrations: string[] = [];
        const backend: string[] = [];
        const frontend: string[] = [];
        const tests: string[] = [];
        const other: string[] = [];

        for (const diff of diffs) {
            const file = diff.file.toLowerCase();

            if (file.includes("migration") || file.endsWith(".sql")) {
                migrations.push(diff.file);
            } else if (file.includes("test") || file.includes("spec")) {
                tests.push(diff.file);
            } else if (
                file.includes("api/") ||
                file.includes("server/") ||
                file.includes("services/")
            ) {
                backend.push(diff.file);
            } else if (
                file.includes("components/") ||
                file.includes("pages/") ||
                file.includes("app/")
            ) {
                frontend.push(diff.file);
            } else {
                other.push(diff.file);
            }
        }

        let position = 1;

        if (migrations.length > 0) {
            suggestions.push({
                name: "Database changes",
                description: "Schema migrations and model updates",
                files: migrations,
                estimatedLines: this.estimateLines(migrations, diffs),
                dependencies: [],
                position: position++,
            });
        }

        if (backend.length > 0) {
            suggestions.push({
                name: "Backend implementation",
                description: "API endpoints and services",
                files: backend,
                estimatedLines: this.estimateLines(backend, diffs),
                dependencies: migrations.length > 0 ? ["Database changes"] : [],
                position: position++,
            });
        }

        if (frontend.length > 0) {
            suggestions.push({
                name: "Frontend implementation",
                description: "UI components and pages",
                files: frontend,
                estimatedLines: this.estimateLines(frontend, diffs),
                dependencies: backend.length > 0 ? ["Backend implementation"] : [],
                position: position++,
            });
        }

        if (tests.length > 0) {
            suggestions.push({
                name: "Tests",
                description: "Test coverage for new functionality",
                files: tests,
                estimatedLines: this.estimateLines(tests, diffs),
                dependencies: [],
                position: position++,
            });
        }

        if (other.length > 0) {
            suggestions.push({
                name: "Other changes",
                description: "Configuration and miscellaneous files",
                files: other,
                estimatedLines: this.estimateLines(other, diffs),
                dependencies: [],
                position: position++,
            });
        }

        return suggestions;
    }

    private estimateLines(files: string[], diffs: DiffContext[]): number {
        return diffs
            .filter((d) => files.includes(d.file))
            .reduce((sum, d) => sum + d.additions + d.deletions, 0);
    }
}

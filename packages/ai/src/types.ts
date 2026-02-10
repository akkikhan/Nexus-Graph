/**
 * NEXUS AI Engine - Multi-LLM Types
 */

export type AIProvider = "anthropic" | "openai" | "google" | "local";

export interface AIConfig {
    providers: {
        anthropic?: {
            apiKey: string;
            model: string;
        };
        openai?: {
            apiKey: string;
            model: string;
        };
        google?: {
            apiKey: string;
            model: string;
        };
    };
    defaultProvider: AIProvider;
    routing: {
        codeReview: AIProvider;
        summarization: AIProvider;
        suggestions: AIProvider;
        riskAssessment: AIProvider;
    };
}

export interface ReviewComment {
    id: string;
    filePath: string;
    lineNumber: number;
    endLineNumber?: number;
    side: "LEFT" | "RIGHT";
    body: string;
    suggestionCode?: string;
    category: ReviewCategory;
    severity: ReviewSeverity;
    confidence: number; // 0-1
}

export type ReviewCategory =
    | "bug"
    | "logic_error"
    | "security"
    | "performance"
    | "style"
    | "documentation"
    | "testing"
    | "best_practice"
    | "refactoring";

export type ReviewSeverity = "info" | "warning" | "error" | "critical";

export interface RiskScore {
    score: number; // 0-100
    level: "low" | "medium" | "high" | "critical";
    factors: RiskFactor[];
    suggestions: string[];
}

export interface RiskFactor {
    name: string;
    description: string;
    weight: number;
    value: number;
}

export interface SplitSuggestion {
    name: string;
    description: string;
    files: string[];
    estimatedLines: number;
    dependencies: string[]; // Names of other splits this depends on
    position: number; // Suggested order in stack
}

export interface ReviewerSuggestion {
    userId: string;
    username: string;
    score: number; // 0-1 relevance score
    reasons: string[];
    availability: "available" | "busy" | "offline";
    expertise: number; // 0-1 expertise in touched files
    workload: number; // Current review workload
}

export interface CodeSearchResult {
    filePath: string;
    lineNumber: number;
    content: string;
    score: number;
    context: string;
}

export interface PRSummary {
    title: string;
    description: string;
    keyChanges: string[];
    potentialImpact: string[];
    testingNotes: string[];
}

export interface DiffContext {
    diff: string;
    file: string;
    additions: number;
    deletions: number;
    patch: string;
}

export interface CodebaseContext {
    repoName: string;
    relevantFiles: Array<{
        path: string;
        content: string;
    }>;
    styleGuide?: string;
    customRules?: string[];
}

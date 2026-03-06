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
    confidence: number;
}

export interface RiskFactor {
    name: string;
    description: string;
    weight: number;
    value: number;
}

export interface RiskScore {
    score: number;
    level: "low" | "medium" | "high" | "critical";
    factors: RiskFactor[];
    suggestions: string[];
}

export interface SplitSuggestion {
    name: string;
    description: string;
    files: string[];
    estimatedLines: number;
    dependencies: string[];
    position: number;
}

export interface ReviewerSuggestion {
    userId: string;
    username: string;
    score: number;
    reasons: string[];
    availability: "available" | "busy" | "offline";
    expertise: number;
    workload: number;
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

export declare class AIOrchestrator {
    constructor(config: AIConfig);
    chat(
        messages: Array<{ role: "user" | "assistant"; content: string }>,
        options?: {
            provider?: AIProvider;
            systemPrompt?: string;
            maxTokens?: number;
            temperature?: number;
        }
    ): Promise<string>;
    getProviderForTask(task: "codeReview" | "summarization" | "suggestions" | "riskAssessment"): AIProvider;
    isProviderAvailable(provider: AIProvider): boolean;
    getAvailableProviders(): AIProvider[];
}

export declare class CodeReviewer {
    constructor(orchestrator: AIOrchestrator);
    reviewDiff(diffContext: DiffContext, codebaseContext?: CodebaseContext): Promise<ReviewComment[]>;
    reviewPR(diffs: DiffContext[], codebaseContext?: CodebaseContext): Promise<ReviewComment[]>;
}

export declare class RiskScorer {
    constructor(orchestrator: AIOrchestrator);
    assessRisk(diffs: DiffContext[], metrics: any): Promise<RiskScore>;
}

export declare class AutoSplitter {
    constructor(orchestrator: AIOrchestrator);
    suggestSplits(diffs: DiffContext[]): Promise<SplitSuggestion[]>;
}

export declare class IntelligentModelRouter {
    route(context: any): Promise<any>;
}

export declare class AIEnsembleDebate {
    constructor(orchestrator: AIOrchestrator);
    debate(diff: DiffContext, models: any): Promise<any>;
}

export declare class CodeIntentDetector {
    constructor(orchestrator: AIOrchestrator);
    analyze(diffs: DiffContext[]): Promise<any>;
}

export declare class ConflictPredictor {
    predictConflicts(...args: any[]): any;
}

export declare class ReviewFlowAnalyzer {
    analyzeFlowState(session: any): any;
    scoreReviewers(prContext: any, candidates: any[]): Array<{ userId: string; username: string; overallScore: number; reasoning: string[] }>;
}

export declare class CodeHealthScorer {
    calculateMetrics(files: Array<{ path: string; content: string }>, testFiles?: Array<{ path: string; content: string }>): any;
    calculateScore(metrics: any): number;
    analyzeImpact(beforeFiles: Array<{ path: string; content: string }>, afterFiles: Array<{ path: string; content: string }>, testFiles?: Array<{ path: string; content: string }>): any;
}

export declare class SmartTestGenerator {
    constructor(orchestrator: AIOrchestrator);
    generateTests(code: string, options?: any): Promise<any>;
}

export declare class ImpactSimulator {
    simulate(diffs: DiffContext[], options?: any): any;
}

export interface NexusAI {
    orchestrator: AIOrchestrator;
    codeReviewer: CodeReviewer;
    riskScorer: RiskScorer;
    autoSplitter: AutoSplitter;
    modelRouter: IntelligentModelRouter;
    ensembleDebate: AIEnsembleDebate;
    intentDetector: CodeIntentDetector;
    conflictPredictor: ConflictPredictor;
    flowAnalyzer: ReviewFlowAnalyzer;
    healthScorer: CodeHealthScorer;
    testGenerator: SmartTestGenerator;
    impactSimulator: ImpactSimulator;
}

export declare function createNexusAI(config: AIConfig): NexusAI;


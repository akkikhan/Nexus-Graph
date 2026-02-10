/**
 * NEXUS Intelligent Model Router
 * Auto-assigns the optimal AI model based on context, code characteristics, and historical performance
 */
import type { DiffContext } from "./types";
interface RoutingContext {
    files: DiffContext[];
    primaryLanguage: string;
    totalTokens: number;
    riskLevel: "low" | "medium" | "high" | "critical";
    prType: "feature" | "bugfix" | "refactor" | "docs" | "security" | "infra";
    reviewType: "full" | "quick" | "security_focused" | "performance_focused";
    authorId?: string;
    repoId?: string;
    maxLatencyMs?: number;
    maxCostCents?: number;
    requiresMultiModel?: boolean;
}
interface RoutingDecision {
    primaryModel: string;
    secondaryModel?: string;
    reasoning: string[];
    confidence: number;
    estimatedCost: number;
    estimatedLatency: number;
}
export declare class IntelligentModelRouter {
    private performanceCache;
    /**
     * Route a review request to the optimal model(s)
     */
    route(context: RoutingContext): Promise<RoutingDecision>;
    /**
     * Calculate task-type alignment score
     */
    private calculateTaskAlignment;
    /**
     * Get historical performance for a model in specific context
     */
    private getHistoricalPerformance;
    /**
     * Record feedback to improve future routing
     */
    recordFeedback(modelId: string, repoId: string, language: string, taskType: string, wasAccepted: boolean, helpfulnessScore: number): Promise<void>;
}
export {};
//# sourceMappingURL=model-router.d.ts.map
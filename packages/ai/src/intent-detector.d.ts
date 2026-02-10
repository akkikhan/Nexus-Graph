/**
 * NEXUS Code Intent Detector
 * Understands WHY code was written, not just what it does
 */
import { AIOrchestrator } from "./orchestrator";
import type { DiffContext } from "./types";
export type CodeIntent = "authentication" | "authorization" | "rate_limiting" | "caching" | "retry_logic" | "error_handling" | "validation" | "data_transformation" | "api_integration" | "logging" | "monitoring" | "testing" | "configuration" | "database_operation" | "file_operation" | "encryption" | "parsing" | "scheduling" | "notification" | "workaround" | "optimization" | "refactoring" | "feature" | "bugfix" | "unknown";
interface DetectedIntent {
    intent: CodeIntent;
    confidence: number;
    evidence: string[];
    location: {
        file: string;
        startLine: number;
        endLine: number;
    };
    implications: string[];
    suggestedChecks: string[];
}
interface IntentAnalysis {
    primaryIntent: CodeIntent;
    secondaryIntents: CodeIntent[];
    detectedPatterns: DetectedIntent[];
    technicalDebtFlags: Array<{
        type: "temporary_workaround" | "todo" | "hack" | "deprecated";
        location: {
            file: string;
            line: number;
        };
        description: string;
    }>;
    architecturalImpact: {
        affectsAuth: boolean;
        affectsData: boolean;
        affectsPerformance: boolean;
        affectsSecurity: boolean;
        affectsReliability: boolean;
    };
}
export declare class CodeIntentDetector {
    private orchestrator;
    constructor(orchestrator: AIOrchestrator);
    /**
     * Analyze code diff to detect intent
     */
    analyze(diffs: DiffContext[]): Promise<IntentAnalysis>;
    /**
     * Enhance pattern detection with AI understanding
     */
    private enhanceWithAI;
    /**
     * Get review guidance based on detected intent
     */
    getReviewGuidance(intent: CodeIntent): string[];
}
export {};
//# sourceMappingURL=intent-detector.d.ts.map
/**
 * NEXUS AI Risk Scoring Engine
 * Calculates multi-factor risk scores for pull requests
 */
import { AIOrchestrator } from "./orchestrator";
import type { RiskScore, DiffContext } from "./types";
interface PRMetrics {
    linesAdded: number;
    linesRemoved: number;
    filesChanged: number;
    testFilesChanged: number;
    authorSuccessRate?: number;
    authorFamiliarityScore?: number;
    timeOfDay?: number;
    dayOfWeek?: number;
}
export declare class RiskScorer {
    private orchestrator;
    constructor(orchestrator: AIOrchestrator);
    /**
     * Calculate comprehensive risk score for a PR
     */
    assessRisk(diffs: DiffContext[], metrics: PRMetrics): Promise<RiskScore>;
    private analyzePRSize;
    private analyzeSensitiveFiles;
    private analyzeInfrastructureChanges;
    private analyzeTestCoverage;
    private analyzeAuthorExperience;
    private analyzeTimingRisk;
    private analyzeWithAI;
    private scoreToLevel;
    private generateSuggestions;
}
export {};
//# sourceMappingURL=risk-scorer.d.ts.map
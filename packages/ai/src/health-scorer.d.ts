/**
 * NEXUS Code Health Score
 * Continuous codebase health monitoring with PR impact analysis
 */
interface HealthMetrics {
    testCoverage: number;
    typeSafety: number;
    documentationCoverage: number;
    avgCyclomaticComplexity: number;
    maxFunctionLength: number;
    deepNestingCount: number;
    duplicateCodePercentage: number;
    deadCodePercentage: number;
    outdatedDependencies: number;
    knownVulnerabilities: number;
    secretsExposed: number;
    todoCount: number;
    hackCount: number;
    deprecatedUsage: number;
}
interface HealthImpact {
    before: HealthMetrics;
    after: HealthMetrics;
    score: {
        before: number;
        after: number;
        delta: number;
        trend: "improving" | "stable" | "degrading";
    };
    improvements: Array<{
        metric: keyof HealthMetrics;
        change: number;
        description: string;
        weight: "high" | "medium" | "low";
    }>;
    regressions: Array<{
        metric: keyof HealthMetrics;
        change: number;
        description: string;
        weight: "high" | "medium" | "low";
        suggestion: string;
    }>;
}
interface FileHealth {
    path: string;
    health: number;
    issues: Array<{
        type: string;
        severity: "critical" | "high" | "medium" | "low";
        line?: number;
        message: string;
    }>;
}
export declare class CodeHealthScorer {
    /**
     * Calculate health metrics for a codebase
     */
    calculateMetrics(files: Array<{
        path: string;
        content: string;
    }>, testFiles?: Array<{
        path: string;
        content: string;
    }>): HealthMetrics;
    /**
     * Calculate overall health score from metrics
     */
    calculateScore(metrics: HealthMetrics): number;
    /**
     * Analyze the health impact of a PR
     */
    analyzeImpact(beforeFiles: Array<{
        path: string;
        content: string;
    }>, afterFiles: Array<{
        path: string;
        content: string;
    }>, testFiles?: Array<{
        path: string;
        content: string;
    }>): HealthImpact;
    private describeChange;
    private getSuggestion;
    /**
     * Get file-level health breakdown
     */
    getFileHealth(files: Array<{
        path: string;
        content: string;
    }>): FileHealth[];
}
export {};
//# sourceMappingURL=health-scorer.d.ts.map
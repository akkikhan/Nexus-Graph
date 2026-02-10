/**
 * NEXUS Predictive Conflict Prevention
 * AI predicts merge conflicts BEFORE they happen
 */
import type { DiffContext } from "./types";
interface ConflictPrediction {
    conflictProbability: number;
    conflictingPRs: Array<{
        prNumber: number;
        prTitle: string;
        authorUsername: string;
        conflictingFiles: string[];
        conflictingLines: Array<{
            file: string;
            yourLines: [number, number];
            theirLines: [number, number];
        }>;
        lastUpdated: Date;
    }>;
    safeWindow: {
        hours: number;
        reasoning: string;
    };
    recommendations: string[];
}
interface PRContext {
    number: number;
    title: string;
    authorUsername: string;
    files: Array<{
        path: string;
        linesModified: [number, number][];
    }>;
    lastUpdated: Date;
    baseBranch: string;
    velocity: number;
}
interface FileHistory {
    path: string;
    recentModifiers: Array<{
        userId: string;
        username: string;
        lastModified: Date;
        frequency: number;
    }>;
    hotspotScore: number;
    avgConflictResolutionMinutes: number;
}
export declare class ConflictPredictor {
    private fileHistoryCache;
    /**
     * Predict potential conflicts for a PR
     */
    predictConflicts(myDiffs: DiffContext[], myBranch: string, openPRs: PRContext[], fileHistories: Map<string, FileHistory>): Promise<ConflictPrediction>;
    /**
     * Extract line ranges from diffs
     */
    private extractLineRanges;
    /**
     * Check if two line ranges overlap
     */
    private rangesOverlap;
    /**
     * Check if two ranges are near each other
     */
    private rangesNear;
    /**
     * Calculate safe merge window
     */
    private calculateSafeWindow;
    /**
     * Generate actionable recommendations
     */
    private generateRecommendations;
}
export {};
//# sourceMappingURL=conflict-predictor.d.ts.map
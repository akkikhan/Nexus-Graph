/**
 * NEXUS Review Flow State Detection
 * Detects when reviewers are fatigued and making mistakes
 */
interface ReviewerSession {
    userId: string;
    username: string;
    sessionStart: Date;
    reviews: Array<{
        prId: string;
        startedAt: Date;
        completedAt: Date;
        linesReviewed: number;
        commentsLeft: number;
        avgCommentLength: number;
        verdict: "approved" | "changes_requested" | "commented";
    }>;
}
interface FlowStateAnalysis {
    currentState: "focused" | "optimal" | "declining" | "fatigued" | "offline";
    confidence: number;
    metrics: {
        reviewsThisSession: number;
        avgReviewDuration: number;
        reviewVelocityTrend: "increasing" | "stable" | "decreasing";
        commentQualityTrend: "improving" | "stable" | "declining";
        approvalRate: number;
        timeSinceBreak: number;
    };
    risks: string[];
    recommendations: string[];
    suggestedAction: "continue" | "take_break" | "stop_reviewing" | "reassign";
}
interface ReviewAssignmentScore {
    userId: string;
    username: string;
    overallScore: number;
    factors: {
        expertise: number;
        availability: number;
        workloadBalance: number;
        recentFatigue: number;
        responseTime: number;
        qualityHistory: number;
    };
    reasoning: string[];
}
export declare class ReviewFlowAnalyzer {
    private sessionCache;
    /**
     * Analyze a reviewer's current flow state
     */
    analyzeFlowState(session: ReviewerSession): FlowStateAnalysis;
    /**
     * Score potential reviewers for optimal assignment
     */
    scoreReviewers(prContext: {
        files: string[];
        complexity: number;
        riskLevel: "low" | "medium" | "high" | "critical";
    }, candidates: Array<{
        userId: string;
        username: string;
        expertiseAreas: string[];
        currentWorkload: number;
        avgResponseTime: number;
        recentSession?: ReviewerSession;
        qualityScore: number;
    }>): ReviewAssignmentScore[];
    private avgDuration;
}
export {};
//# sourceMappingURL=flow-analyzer.d.ts.map
/**
 * NEXUS Review Flow State Detection
 * Detects when reviewers are fatigued and making mistakes
 */
// Thresholds for fatigue detection
const FATIGUE_THRESHOLDS = {
    MAX_REVIEWS_BEFORE_BREAK: 5,
    MIN_REVIEW_DURATION_MINUTES: 3,
    MAX_SESSION_DURATION_MINUTES: 120,
    MIN_COMMENT_LENGTH_WORDS: 5,
    RUBBER_STAMP_THRESHOLD_MINUTES: 2,
    APPROVAL_RATE_CONCERN: 0.9, // 90%+ approval rate is suspicious
};
export class ReviewFlowAnalyzer {
    sessionCache = new Map();
    /**
     * Analyze a reviewer's current flow state
     */
    analyzeFlowState(session) {
        const now = new Date();
        const reviews = session.reviews;
        const recentReviews = reviews.slice(-5); // Last 5 reviews
        // Calculate metrics
        const reviewsThisSession = reviews.length;
        const sessionDuration = (now.getTime() - session.sessionStart.getTime()) / 1000 / 60;
        const avgReviewDuration = recentReviews.length > 0
            ? recentReviews.reduce((sum, r) => sum +
                (r.completedAt.getTime() - r.startedAt.getTime()) / 1000 / 60, 0) / recentReviews.length
            : 0;
        const avgCommentLength = recentReviews.length > 0
            ? recentReviews.reduce((sum, r) => sum + r.avgCommentLength, 0) /
                recentReviews.length
            : 0;
        const approvalRate = recentReviews.length > 0
            ? recentReviews.filter((r) => r.verdict === "approved").length /
                recentReviews.length
            : 0;
        // Calculate velocity trend
        let reviewVelocityTrend = "stable";
        if (recentReviews.length >= 3) {
            const firstHalfAvg = this.avgDuration(recentReviews.slice(0, 2));
            const secondHalfAvg = this.avgDuration(recentReviews.slice(-2));
            if (secondHalfAvg < firstHalfAvg * 0.7) {
                reviewVelocityTrend = "increasing"; // Reviews getting faster (concerning)
            }
            else if (secondHalfAvg > firstHalfAvg * 1.3) {
                reviewVelocityTrend = "decreasing"; // Reviews getting slower (fatigue)
            }
        }
        // Calculate comment quality trend
        let commentQualityTrend = "stable";
        if (recentReviews.length >= 3) {
            const firstHalfAvgLength = recentReviews.slice(0, 2).reduce((s, r) => s + r.avgCommentLength, 0) / 2;
            const secondHalfAvgLength = recentReviews.slice(-2).reduce((s, r) => s + r.avgCommentLength, 0) / 2;
            if (secondHalfAvgLength < firstHalfAvgLength * 0.6) {
                commentQualityTrend = "declining";
            }
            else if (secondHalfAvgLength > firstHalfAvgLength * 1.2) {
                commentQualityTrend = "improving";
            }
        }
        // Determine flow state
        const risks = [];
        const recommendations = [];
        let currentState = "optimal";
        let suggestedAction = "continue";
        // Check for rubber stamping
        if (avgReviewDuration < FATIGUE_THRESHOLDS.RUBBER_STAMP_THRESHOLD_MINUTES &&
            reviewsThisSession >= 3) {
            risks.push("Possible rubber stamping detected - reviews are very quick");
            currentState = "fatigued";
            suggestedAction = "reassign";
        }
        // Check for fatigue indicators
        if (reviewsThisSession >= FATIGUE_THRESHOLDS.MAX_REVIEWS_BEFORE_BREAK) {
            risks.push(`${reviewsThisSession} reviews without a break exceeds recommended limit`);
            currentState = "declining";
            suggestedAction = "take_break";
        }
        if (sessionDuration > FATIGUE_THRESHOLDS.MAX_SESSION_DURATION_MINUTES) {
            risks.push(`Session duration (${Math.round(sessionDuration)}min) is very long`);
            currentState = "fatigued";
            suggestedAction = "stop_reviewing";
        }
        if (avgCommentLength < FATIGUE_THRESHOLDS.MIN_COMMENT_LENGTH_WORDS &&
            recentReviews.some((r) => r.commentsLeft > 0)) {
            risks.push("Comment quality is declining - shorter than usual");
            if (currentState === "optimal")
                currentState = "declining";
        }
        if (approvalRate >= FATIGUE_THRESHOLDS.APPROVAL_RATE_CONCERN) {
            risks.push(`High approval rate (${Math.round(approvalRate * 100)}%) - may be missing issues`);
            if (currentState === "optimal")
                currentState = "declining";
        }
        if (reviewVelocityTrend === "increasing" && reviewsThisSession >= 3) {
            risks.push("Reviews are getting faster - possible fatigue");
        }
        if (commentQualityTrend === "declining") {
            risks.push("Comment quality is declining over time");
        }
        // Generate recommendations
        if (currentState === "optimal") {
            recommendations.push("✅ Reviewer is in good flow state");
        }
        if (suggestedAction === "take_break") {
            recommendations.push("☕ Recommend a 10-15 minute break");
            recommendations.push(`📊 ${session.username} has reviewed ${reviewsThisSession} PRs this session`);
        }
        if (suggestedAction === "stop_reviewing") {
            recommendations.push("🛑 Recommend ending review session for today");
            recommendations.push("📅 Queue remaining PRs for next session");
        }
        if (suggestedAction === "reassign") {
            recommendations.push("🔄 Consider reassigning PR to another reviewer");
            recommendations.push(`⚠️ ${session.username}'s review quality may be compromised`);
        }
        // Add time-based recommendations
        const hour = now.getHours();
        if (hour >= 17) {
            recommendations.push("🌙 End of day - consider deferring complex reviews");
        }
        if (now.getDay() === 5 && hour >= 15) {
            recommendations.push("📅 Friday afternoon - avoid merging critical changes");
        }
        return {
            currentState,
            confidence: risks.length === 0 ? 0.9 : 0.7,
            metrics: {
                reviewsThisSession,
                avgReviewDuration: Math.round(avgReviewDuration * 10) / 10,
                reviewVelocityTrend,
                commentQualityTrend,
                approvalRate: Math.round(approvalRate * 100) / 100,
                timeSinceBreak: Math.round(sessionDuration),
            },
            risks,
            recommendations,
            suggestedAction,
        };
    }
    /**
     * Score potential reviewers for optimal assignment
     */
    scoreReviewers(prContext, candidates) {
        return candidates
            .map((candidate) => {
            const factors = {
                expertise: 0,
                availability: 0,
                workloadBalance: 0,
                recentFatigue: 0,
                responseTime: 0,
                qualityHistory: 0,
            };
            const reasoning = [];
            // Expertise match
            const matchingAreas = prContext.files.filter((f) => candidate.expertiseAreas.some((area) => f.toLowerCase().includes(area.toLowerCase())));
            factors.expertise = Math.min(1, matchingAreas.length / prContext.files.length);
            if (factors.expertise > 0.7) {
                reasoning.push(`High expertise match (${Math.round(factors.expertise * 100)}%)`);
            }
            // Availability (inverse of workload)
            factors.availability = Math.max(0, 1 - candidate.currentWorkload * 0.15);
            if (candidate.currentWorkload > 5) {
                reasoning.push(`High workload (${candidate.currentWorkload} PRs in queue)`);
            }
            // Workload balance
            factors.workloadBalance = factors.availability; // Simplification
            // Fatigue check
            if (candidate.recentSession) {
                const flowState = this.analyzeFlowState(candidate.recentSession);
                factors.recentFatigue =
                    flowState.currentState === "optimal"
                        ? 1
                        : flowState.currentState === "declining"
                            ? 0.5
                            : 0.2;
                if (flowState.currentState !== "optimal") {
                    reasoning.push(`Flow state: ${flowState.currentState}`);
                }
            }
            else {
                factors.recentFatigue = 1; // Fresh
            }
            // Response time (faster is better, max 24h)
            factors.responseTime = Math.max(0, 1 - candidate.avgResponseTime / 24);
            // Quality history
            factors.qualityHistory = candidate.qualityScore;
            // Weight factors based on PR risk
            const weights = prContext.riskLevel === "critical"
                ? { expertise: 0.35, quality: 0.3, fatigue: 0.2, rest: 0.15 }
                : prContext.riskLevel === "high"
                    ? { expertise: 0.3, quality: 0.25, fatigue: 0.25, rest: 0.2 }
                    : { expertise: 0.25, quality: 0.2, fatigue: 0.2, rest: 0.35 };
            const overallScore = factors.expertise * weights.expertise +
                factors.qualityHistory * weights.quality +
                factors.recentFatigue * weights.fatigue +
                ((factors.availability + factors.responseTime + factors.workloadBalance) / 3) *
                    weights.rest;
            return {
                userId: candidate.userId,
                username: candidate.username,
                overallScore: Math.round(overallScore * 100) / 100,
                factors,
                reasoning,
            };
        })
            .sort((a, b) => b.overallScore - a.overallScore);
    }
    avgDuration(reviews) {
        if (reviews.length === 0)
            return 0;
        return (reviews.reduce((sum, r) => sum + (r.completedAt.getTime() - r.startedAt.getTime()) / 1000 / 60, 0) / reviews.length);
    }
}
//# sourceMappingURL=flow-analyzer.js.map
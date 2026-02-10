/**
 * NEXUS Intelligent Model Router
 * Auto-assigns the optimal AI model based on context, code characteristics, and historical performance
 */
// Model capabilities and strengths
const MODEL_PROFILES = {
    "claude-sonnet-4-20250514": {
        provider: "anthropic",
        strengths: ["security", "logic_errors", "complex_refactoring", "api_design"],
        languages: ["typescript", "python", "rust", "go"],
        maxContextTokens: 200000,
        costPer1kTokens: 0.003,
        avgLatencyMs: 2500,
        accuracyScore: 0.94,
    },
    "gpt-4o": {
        provider: "openai",
        strengths: ["documentation", "testing", "code_style", "naming"],
        languages: ["javascript", "java", "c#", "php"],
        maxContextTokens: 128000,
        costPer1kTokens: 0.005,
        avgLatencyMs: 3000,
        accuracyScore: 0.91,
    },
    "gemini-2.0-flash": {
        provider: "google",
        strengths: ["large_codebase", "multi_file", "performance", "infrastructure"],
        languages: ["python", "kotlin", "swift", "yaml"],
        maxContextTokens: 1000000,
        costPer1kTokens: 0.001,
        avgLatencyMs: 1500,
        accuracyScore: 0.88,
    },
};
export class IntelligentModelRouter {
    performanceCache = new Map();
    /**
     * Route a review request to the optimal model(s)
     */
    async route(context) {
        const scores = {};
        const reasoning = [];
        for (const [modelId, profile] of Object.entries(MODEL_PROFILES)) {
            let score = 0;
            // 1. Language affinity (weight: 25%)
            if (profile.languages.includes(context.primaryLanguage)) {
                score += 25;
                reasoning.push(`${modelId}: +25 for ${context.primaryLanguage} expertise`);
            }
            // 2. Task type alignment (weight: 30%)
            const taskAlignmentScore = this.calculateTaskAlignment(profile.strengths, context.prType, context.reviewType);
            score += taskAlignmentScore * 0.3;
            // 3. Context window fit (weight: 15%)
            if (context.totalTokens <= profile.maxContextTokens * 0.8) {
                score += 15;
            }
            else if (context.totalTokens > profile.maxContextTokens) {
                score -= 50; // Disqualify if can't fit
            }
            // 4. Historical performance for this repo/language (weight: 20%)
            const historyScore = await this.getHistoricalPerformance(modelId, context.repoId, context.primaryLanguage);
            score += historyScore * 0.2;
            // 5. Cost efficiency (weight: 10%)
            if (context.maxCostCents) {
                const estimatedCost = (context.totalTokens / 1000) * profile.costPer1kTokens * 100;
                if (estimatedCost <= context.maxCostCents) {
                    score += 10 * (1 - estimatedCost / context.maxCostCents);
                }
                else {
                    score -= 20;
                }
            }
            // 6. Latency requirements (bonus/penalty)
            if (context.maxLatencyMs && profile.avgLatencyMs > context.maxLatencyMs) {
                score -= 15;
            }
            // 7. Risk-based adjustment
            if (context.riskLevel === "critical" || context.riskLevel === "high") {
                // For high-risk, prefer accuracy over speed/cost
                score += profile.accuracyScore * 20;
                reasoning.push(`${modelId}: +${(profile.accuracyScore * 20).toFixed(0)} for high-risk accuracy`);
            }
            scores[modelId] = score;
        }
        // Find best model
        const sortedModels = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        const primaryModel = sortedModels[0][0];
        const primaryProfile = MODEL_PROFILES[primaryModel];
        const decision = {
            primaryModel,
            reasoning,
            confidence: scores[primaryModel] / 100,
            estimatedCost: (context.totalTokens / 1000) * primaryProfile.costPer1kTokens,
            estimatedLatency: primaryProfile.avgLatencyMs,
        };
        // For critical/security reviews, add ensemble mode
        if (context.requiresMultiModel ||
            context.riskLevel === "critical" ||
            context.prType === "security") {
            decision.secondaryModel = sortedModels[1][0];
            reasoning.push(`Adding ${decision.secondaryModel} for ensemble verification`);
        }
        return decision;
    }
    /**
     * Calculate task-type alignment score
     */
    calculateTaskAlignment(strengths, prType, reviewType) {
        const taskStrengthMap = {
            feature: ["api_design", "logic_errors", "testing"],
            bugfix: ["logic_errors", "security", "performance"],
            refactor: ["complex_refactoring", "code_style", "documentation"],
            docs: ["documentation", "naming"],
            security: ["security", "logic_errors"],
            infra: ["infrastructure", "large_codebase"],
        };
        const relevantStrengths = taskStrengthMap[prType] || [];
        const overlap = strengths.filter((s) => relevantStrengths.includes(s)).length;
        return (overlap / Math.max(relevantStrengths.length, 1)) * 100;
    }
    /**
     * Get historical performance for a model in specific context
     */
    async getHistoricalPerformance(modelId, repoId, language) {
        // In production, this would query the database
        const key = `${modelId}:${repoId || "global"}:${language || "all"}`;
        const history = this.performanceCache.get(key);
        if (!history || history.length === 0) {
            // Default to model's base accuracy
            return MODEL_PROFILES[modelId]?.accuracyScore * 100 || 50;
        }
        // Weighted average of acceptance rate and helpfulness
        const avgAcceptance = history.reduce((sum, h) => sum + h.acceptanceRate * h.sampleSize, 0) /
            history.reduce((sum, h) => sum + h.sampleSize, 0);
        const avgHelpfulness = history.reduce((sum, h) => sum + h.avgHelpfulnessScore * h.sampleSize, 0) /
            history.reduce((sum, h) => sum + h.sampleSize, 0);
        return avgAcceptance * 0.6 + avgHelpfulness * 0.4;
    }
    /**
     * Record feedback to improve future routing
     */
    async recordFeedback(modelId, repoId, language, taskType, wasAccepted, helpfulnessScore // 1-5
    ) {
        const key = `${modelId}:${repoId}:${language}`;
        const existing = this.performanceCache.get(key) || [];
        // Update or add history entry
        const entry = existing.find((e) => e.taskType === taskType);
        if (entry) {
            const total = entry.sampleSize + 1;
            entry.acceptanceRate = (entry.acceptanceRate * entry.sampleSize + (wasAccepted ? 1 : 0)) / total;
            entry.avgHelpfulnessScore =
                (entry.avgHelpfulnessScore * entry.sampleSize + helpfulnessScore / 5) / total;
            entry.sampleSize = total;
        }
        else {
            existing.push({
                modelId,
                repoId,
                language,
                taskType,
                acceptanceRate: wasAccepted ? 1 : 0,
                falsePositiveRate: 0,
                avgHelpfulnessScore: helpfulnessScore / 5,
                sampleSize: 1,
            });
        }
        this.performanceCache.set(key, existing);
    }
}
//# sourceMappingURL=model-router.js.map
/**
 * NEXUS AI Risk Scoring Engine
 * Calculates multi-factor risk scores for pull requests
 */
// Sensitive file patterns
const SENSITIVE_PATTERNS = [
    /auth/i,
    /login/i,
    /password/i,
    /secret/i,
    /token/i,
    /payment/i,
    /billing/i,
    /checkout/i,
    /security/i,
    /permission/i,
    /admin/i,
    /\.env/,
    /config\.(ts|js|json)$/,
    /migration/i,
];
// Infrastructure file patterns
const INFRA_PATTERNS = [
    /dockerfile/i,
    /docker-compose/i,
    /kubernetes/i,
    /k8s/i,
    /\.ya?ml$/,
    /terraform/i,
    /\.tf$/,
    /ci\//i,
    /\.github\/workflows/i,
    /jenkinsfile/i,
];
export class RiskScorer {
    orchestrator;
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
    }
    /**
     * Calculate comprehensive risk score for a PR
     */
    async assessRisk(diffs, metrics) {
        const factors = [];
        let totalWeight = 0;
        let weightedScore = 0;
        // 1. Size Analysis
        const sizeFactor = this.analyzePRSize(metrics);
        factors.push(sizeFactor);
        totalWeight += sizeFactor.weight;
        weightedScore += sizeFactor.value * sizeFactor.weight;
        // 2. Sensitive Files Analysis
        const sensitiveFactor = this.analyzeSensitiveFiles(diffs);
        factors.push(sensitiveFactor);
        totalWeight += sensitiveFactor.weight;
        weightedScore += sensitiveFactor.value * sensitiveFactor.weight;
        // 3. Infrastructure Changes
        const infraFactor = this.analyzeInfrastructureChanges(diffs);
        factors.push(infraFactor);
        totalWeight += infraFactor.weight;
        weightedScore += infraFactor.value * infraFactor.weight;
        // 4. Test Coverage
        const testFactor = this.analyzeTestCoverage(metrics);
        factors.push(testFactor);
        totalWeight += testFactor.weight;
        weightedScore += testFactor.value * testFactor.weight;
        // 5. Author Experience
        if (metrics.authorSuccessRate !== undefined) {
            const authorFactor = this.analyzeAuthorExperience(metrics);
            factors.push(authorFactor);
            totalWeight += authorFactor.weight;
            weightedScore += authorFactor.value * authorFactor.weight;
        }
        // 6. Timing Analysis
        if (metrics.timeOfDay !== undefined && metrics.dayOfWeek !== undefined) {
            const timingFactor = this.analyzeTimingRisk(metrics);
            factors.push(timingFactor);
            totalWeight += timingFactor.weight;
            weightedScore += timingFactor.value * timingFactor.weight;
        }
        // 7. AI-based content analysis
        const aiFactors = await this.analyzeWithAI(diffs);
        for (const factor of aiFactors) {
            factors.push(factor);
            totalWeight += factor.weight;
            weightedScore += factor.value * factor.weight;
        }
        // Calculate final score
        const score = Math.round((weightedScore / totalWeight) * 100);
        const level = this.scoreToLevel(score);
        const suggestions = this.generateSuggestions(factors);
        return {
            score,
            level,
            factors: factors.filter((f) => f.value > 0.3), // Only show significant factors
            suggestions,
        };
    }
    analyzePRSize(metrics) {
        const totalLines = metrics.linesAdded + metrics.linesRemoved;
        let value;
        let description;
        if (totalLines < 100) {
            value = 0.1;
            description = "Small PR, easy to review";
        }
        else if (totalLines < 300) {
            value = 0.3;
            description = "Medium-sized PR";
        }
        else if (totalLines < 500) {
            value = 0.6;
            description = "Large PR, harder to review carefully";
        }
        else {
            value = 0.9;
            description = "Very large PR, high risk of missed issues";
        }
        return {
            name: "PR Size",
            description,
            weight: 2,
            value,
        };
    }
    analyzeSensitiveFiles(diffs) {
        const sensitiveFiles = diffs.filter((d) => SENSITIVE_PATTERNS.some((pattern) => pattern.test(d.file)));
        const value = Math.min(1, sensitiveFiles.length * 0.3);
        return {
            name: "Sensitive Files",
            description: sensitiveFiles.length > 0
                ? `Modifies ${sensitiveFiles.length} sensitive file(s): ${sensitiveFiles.map((f) => f.file).join(", ")}`
                : "No sensitive files modified",
            weight: 3,
            value,
        };
    }
    analyzeInfrastructureChanges(diffs) {
        const infraFiles = diffs.filter((d) => INFRA_PATTERNS.some((pattern) => pattern.test(d.file)));
        const value = Math.min(1, infraFiles.length * 0.4);
        return {
            name: "Infrastructure Changes",
            description: infraFiles.length > 0
                ? `Modifies ${infraFiles.length} infrastructure file(s)`
                : "No infrastructure changes",
            weight: 2.5,
            value,
        };
    }
    analyzeTestCoverage(metrics) {
        const testRatio = metrics.filesChanged > 0
            ? metrics.testFilesChanged / metrics.filesChanged
            : 0;
        let value;
        let description;
        if (testRatio === 0 && metrics.linesAdded > 50) {
            value = 0.8;
            description = "No test changes for significant code changes";
        }
        else if (testRatio < 0.2) {
            value = 0.5;
            description = "Low test coverage for changes";
        }
        else if (testRatio < 0.5) {
            value = 0.2;
            description = "Moderate test coverage";
        }
        else {
            value = 0.05;
            description = "Good test coverage";
        }
        return {
            name: "Test Coverage",
            description,
            weight: 2,
            value,
        };
    }
    analyzeAuthorExperience(metrics) {
        const successRate = metrics.authorSuccessRate || 0.5;
        const familiarity = metrics.authorFamiliarityScore || 0.5;
        const value = 1 - (successRate * 0.6 + familiarity * 0.4);
        return {
            name: "Author Experience",
            description: value > 0.5
                ? "Author is less familiar with these files"
                : "Author has good history with these files",
            weight: 1.5,
            value,
        };
    }
    analyzeTimingRisk(metrics) {
        const hour = metrics.timeOfDay || 12;
        const day = metrics.dayOfWeek || 2;
        let value = 0;
        let description = "Normal working hours";
        // Friday afternoon deployments are risky
        if (day === 5 && hour >= 15) {
            value = 0.7;
            description = "Friday afternoon - higher deploy risk";
        }
        // Late night changes
        else if (hour >= 22 || hour <= 5) {
            value = 0.5;
            description = "Late night change - may lack thorough review";
        }
        // Weekend
        else if (day === 0 || day === 6) {
            value = 0.3;
            description = "Weekend change - fewer reviewers available";
        }
        return {
            name: "Timing Risk",
            description,
            weight: 1,
            value,
        };
    }
    async analyzeWithAI(diffs) {
        const factors = [];
        // Combine all diffs for analysis
        const allChanges = diffs
            .map((d) => `File: ${d.file}\n${d.diff}`)
            .join("\n\n---\n\n");
        if (allChanges.length > 50000) {
            // Skip AI analysis for very large PRs
            return factors;
        }
        try {
            const provider = this.orchestrator.getProviderForTask("riskAssessment");
            const response = await this.orchestrator.chat([
                {
                    role: "user",
                    content: `Analyze these code changes for potential risks. Look for:
1. Security vulnerabilities
2. Performance issues
3. Logic errors
4. Breaking changes

Changes:
${allChanges.slice(0, 30000)}

Respond with JSON array of risks found:
[{ "type": "security|performance|logic|breaking", "severity": 0-1, "description": "..." }]

If no significant risks found, return: []`,
                },
            ], {
                provider,
                systemPrompt: "You are a security and code quality expert. Identify real risks only.",
                maxTokens: 2048,
                temperature: 0.1,
            });
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const risks = JSON.parse(jsonMatch[0]);
                for (const risk of risks.slice(0, 3)) {
                    // Max 3 AI factors
                    factors.push({
                        name: `AI: ${risk.type}`,
                        description: risk.description,
                        weight: 2,
                        value: risk.severity || 0.5,
                    });
                }
            }
        }
        catch {
            // AI analysis failed, continue without it
        }
        return factors;
    }
    scoreToLevel(score) {
        if (score < 25)
            return "low";
        if (score < 50)
            return "medium";
        if (score < 75)
            return "high";
        return "critical";
    }
    generateSuggestions(factors) {
        const suggestions = [];
        for (const factor of factors) {
            if (factor.name === "PR Size" && factor.value > 0.5) {
                suggestions.push("Consider splitting this PR into smaller, focused changes");
            }
            if (factor.name === "Test Coverage" && factor.value > 0.5) {
                suggestions.push("Add tests to cover the new functionality");
            }
            if (factor.name === "Sensitive Files" && factor.value > 0.3) {
                suggestions.push("Request review from security team");
            }
            if (factor.name === "Timing Risk" && factor.value > 0.5) {
                suggestions.push("Consider deploying at a safer time");
            }
        }
        return suggestions;
    }
}
//# sourceMappingURL=risk-scorer.js.map
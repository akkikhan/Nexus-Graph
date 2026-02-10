/**
 * NEXUS Code Health Score
 * Continuous codebase health monitoring with PR impact analysis
 */

interface HealthMetrics {
    // Code quality
    testCoverage: number; // 0-100
    typeSafety: number; // 0-100
    documentationCoverage: number; // 0-100

    // Complexity
    avgCyclomaticComplexity: number;
    maxFunctionLength: number;
    deepNestingCount: number;

    // Maintainability
    duplicateCodePercentage: number;
    deadCodePercentage: number;
    outdatedDependencies: number;

    // Security
    knownVulnerabilities: number;
    secretsExposed: number;

    // Technical debt
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
    health: number; // 0-100
    issues: Array<{
        type: string;
        severity: "critical" | "high" | "medium" | "low";
        line?: number;
        message: string;
    }>;
}

// Weights for different metrics in overall score
const METRIC_WEIGHTS: Record<keyof HealthMetrics, number> = {
    testCoverage: 15,
    typeSafety: 12,
    documentationCoverage: 8,
    avgCyclomaticComplexity: 10,
    maxFunctionLength: 5,
    deepNestingCount: 5,
    duplicateCodePercentage: 8,
    deadCodePercentage: 5,
    outdatedDependencies: 5,
    knownVulnerabilities: 12,
    secretsExposed: 10,
    todoCount: 2,
    hackCount: 2,
    deprecatedUsage: 1,
};

// Pattern detection for metrics
const PATTERNS = {
    DEEP_NESTING: /^\s{12,}/gm, // 3+ levels of indentation
    ANY_TYPE: /:\s*any\b/g,
    TODO: /\/\/\s*(TODO|FIXME)/gi,
    HACK: /\/\/\s*(HACK|XXX)/gi,
    DEPRECATED: /@deprecated/gi,
    SECRET_PATTERN: /(password|secret|api_key|token)\s*[=:]\s*['"][^'"]+['"]/gi,
    CONSOLE_LOG: /console\.(log|warn|error|debug)/g,
    LONG_FUNCTION: /^(function|const\s+\w+\s*=|async\s+function|\w+\s*\()/gm,
};

export class CodeHealthScorer {
    /**
     * Calculate health metrics for a codebase
     */
    calculateMetrics(
        files: Array<{ path: string; content: string }>,
        testFiles: Array<{ path: string; content: string }> = []
    ): HealthMetrics {
        let totalLines = 0;
        let typedLines = 0;
        let documentedFunctions = 0;
        let totalFunctions = 0;
        let deepNestingCount = 0;
        let duplicatePatterns = 0;
        let todoCount = 0;
        let hackCount = 0;
        let secretsExposed = 0;
        let deprecatedUsage = 0;
        let anyTypeCount = 0;
        const complexities: number[] = [];
        const functionLengths: number[] = [];

        for (const file of files) {
            const lines = file.content.split("\n");
            totalLines += lines.length;

            // Type safety (for TypeScript files)
            if (file.path.match(/\.(ts|tsx)$/)) {
                const anyMatches = file.content.match(PATTERNS.ANY_TYPE);
                anyTypeCount += anyMatches?.length || 0;
                typedLines += lines.filter((l) => l.includes(":")).length;
            }

            // Documentation coverage
            const jsdocMatches = file.content.match(/\/\*\*[\s\S]*?\*\//g);
            documentedFunctions += jsdocMatches?.length || 0;

            // Function count and complexity
            const functionMatches = file.content.match(PATTERNS.LONG_FUNCTION);
            totalFunctions += functionMatches?.length || 0;

            // Deep nesting
            const deepNestMatches = file.content.match(PATTERNS.DEEP_NESTING);
            deepNestingCount += deepNestMatches?.length || 0;

            // Technical debt markers
            todoCount += (file.content.match(PATTERNS.TODO) || []).length;
            hackCount += (file.content.match(PATTERNS.HACK) || []).length;
            deprecatedUsage += (file.content.match(PATTERNS.DEPRECATED) || []).length;

            // Security issues
            secretsExposed += (file.content.match(PATTERNS.SECRET_PATTERN) || []).length;

            // Estimate function complexity
            const braceMatches = file.content.match(/\{|\}/g);
            const ifMatches = file.content.match(/\bif\s*\(/g);
            const loopMatches = file.content.match(/\b(for|while)\s*\(/g);
            const ternaryMatches = file.content.match(/\?.*:/g);

            complexities.push(
                ((ifMatches?.length || 0) +
                    (loopMatches?.length || 0) +
                    (ternaryMatches?.length || 0)) /
                Math.max(1, totalFunctions)
            );
        }

        // Test coverage estimation (simplified)
        const testCoverage =
            testFiles.length > 0
                ? Math.min(100, (testFiles.length / files.length) * 100 * 1.5)
                : 0;

        return {
            testCoverage: Math.round(testCoverage),
            typeSafety: Math.round(
                Math.max(0, 100 - anyTypeCount * 5)
            ),
            documentationCoverage: Math.round(
                (documentedFunctions / Math.max(1, totalFunctions)) * 100
            ),
            avgCyclomaticComplexity:
                complexities.length > 0
                    ? Math.round(
                        (complexities.reduce((a, b) => a + b, 0) / complexities.length) * 10
                    ) / 10
                    : 0,
            maxFunctionLength:
                functionLengths.length > 0 ? Math.max(...functionLengths) : 0,
            deepNestingCount,
            duplicateCodePercentage: Math.min(100, duplicatePatterns * 5),
            deadCodePercentage: 0, // Would require more sophisticated analysis
            outdatedDependencies: 0, // Would require dependency scan
            knownVulnerabilities: 0, // Would require vulnerability database
            secretsExposed,
            todoCount,
            hackCount,
            deprecatedUsage,
        };
    }

    /**
     * Calculate overall health score from metrics
     */
    calculateScore(metrics: HealthMetrics): number {
        let score = 100;

        // Positive factors (higher is better)
        score += (metrics.testCoverage - 50) * (METRIC_WEIGHTS.testCoverage / 50);
        score += (metrics.typeSafety - 80) * (METRIC_WEIGHTS.typeSafety / 20);
        score += (metrics.documentationCoverage - 30) * (METRIC_WEIGHTS.documentationCoverage / 70);

        // Negative factors (lower is better)
        score -= Math.max(0, metrics.avgCyclomaticComplexity - 5) * 2;
        score -= metrics.deepNestingCount * 0.5;
        score -= metrics.duplicateCodePercentage * 0.3;
        score -= metrics.knownVulnerabilities * 10;
        score -= metrics.secretsExposed * 20;
        score -= metrics.hackCount * 2;
        score -= metrics.todoCount * 0.5;

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    /**
     * Analyze the health impact of a PR
     */
    analyzeImpact(
        beforeFiles: Array<{ path: string; content: string }>,
        afterFiles: Array<{ path: string; content: string }>,
        testFiles: Array<{ path: string; content: string }> = []
    ): HealthImpact {
        const before = this.calculateMetrics(beforeFiles, testFiles);
        const after = this.calculateMetrics(afterFiles, testFiles);

        const scoreBefore = this.calculateScore(before);
        const scoreAfter = this.calculateScore(after);
        const delta = scoreAfter - scoreBefore;

        const improvements: HealthImpact["improvements"] = [];
        const regressions: HealthImpact["regressions"] = [];

        // Compare each metric
        for (const key of Object.keys(before) as (keyof HealthMetrics)[]) {
            const diff = (after[key] as number) - (before[key] as number);

            // Determine if change is good or bad based on metric type
            const isPositiveMetric = [
                "testCoverage",
                "typeSafety",
                "documentationCoverage",
            ].includes(key);
            const isImprovement = isPositiveMetric ? diff > 0 : diff < 0;

            if (Math.abs(diff) < 0.5) continue; // Ignore tiny changes

            const weight =
                METRIC_WEIGHTS[key] > 10
                    ? "high"
                    : METRIC_WEIGHTS[key] > 5
                        ? "medium"
                        : "low";

            if (isImprovement) {
                improvements.push({
                    metric: key,
                    change: diff,
                    description: this.describeChange(key, diff, isPositiveMetric),
                    weight,
                });
            } else {
                regressions.push({
                    metric: key,
                    change: diff,
                    description: this.describeChange(key, diff, isPositiveMetric),
                    weight,
                    suggestion: this.getSuggestion(key),
                });
            }
        }

        return {
            before,
            after,
            score: {
                before: scoreBefore,
                after: scoreAfter,
                delta,
                trend:
                    delta > 2 ? "improving" : delta < -2 ? "degrading" : "stable",
            },
            improvements,
            regressions,
        };
    }

    private describeChange(
        metric: keyof HealthMetrics,
        change: number,
        isPositive: boolean
    ): string {
        const absChange = Math.abs(change);
        const direction = change > 0 ? "increased" : "decreased";

        const descriptions: Record<keyof HealthMetrics, string> = {
            testCoverage: `Test coverage ${direction} by ${absChange.toFixed(1)}%`,
            typeSafety: `Type safety ${direction} by ${absChange.toFixed(1)}%`,
            documentationCoverage: `Documentation ${direction} by ${absChange.toFixed(1)}%`,
            avgCyclomaticComplexity: `Average complexity ${direction} to ${absChange.toFixed(1)}`,
            maxFunctionLength: `Max function length is now ${absChange} lines`,
            deepNestingCount: `${absChange} instances of deep nesting ${change > 0 ? "added" : "removed"}`,
            duplicateCodePercentage: `Code duplication ${direction} by ${absChange.toFixed(1)}%`,
            deadCodePercentage: `Dead code ${direction} by ${absChange.toFixed(1)}%`,
            outdatedDependencies: `${absChange} outdated dependencies ${change > 0 ? "added" : "updated"}`,
            knownVulnerabilities: `${absChange} security vulnerabilities ${change > 0 ? "introduced" : "fixed"}`,
            secretsExposed: `${absChange} secrets ${change > 0 ? "exposed" : "removed"}`,
            todoCount: `${absChange} TODO markers ${change > 0 ? "added" : "resolved"}`,
            hackCount: `${absChange} HACK markers ${change > 0 ? "added" : "removed"}`,
            deprecatedUsage: `${absChange} deprecated API usages ${change > 0 ? "added" : "fixed"}`,
        };

        return descriptions[metric];
    }

    private getSuggestion(metric: keyof HealthMetrics): string {
        const suggestions: Record<keyof HealthMetrics, string> = {
            testCoverage: "Add unit tests for new code paths",
            typeSafety: "Replace 'any' types with proper interfaces",
            documentationCoverage: "Add JSDoc comments to public functions",
            avgCyclomaticComplexity: "Break complex functions into smaller pieces",
            maxFunctionLength: "Consider extracting logic into helper functions",
            deepNestingCount: "Use early returns to reduce nesting",
            duplicateCodePercentage: "Extract duplicated code into shared utilities",
            deadCodePercentage: "Remove unused code",
            outdatedDependencies: "Run 'npm update' to update dependencies",
            knownVulnerabilities: "Fix security issues before merging",
            secretsExposed: "Move secrets to environment variables",
            todoCount: "Consider addressing TODOs or creating tickets",
            hackCount: "Document why the hack is needed and plan removal",
            deprecatedUsage: "Migrate to non-deprecated alternatives",
        };

        return suggestions[metric];
    }

    /**
     * Get file-level health breakdown
     */
    getFileHealth(files: Array<{ path: string; content: string }>): FileHealth[] {
        return files.map((file) => {
            const issues: FileHealth["issues"] = [];
            let health = 100;

            // Check for issues
            const anyTypes = file.content.match(PATTERNS.ANY_TYPE);
            if (anyTypes && anyTypes.length > 3) {
                issues.push({
                    type: "type_safety",
                    severity: "medium",
                    message: `${anyTypes.length} uses of 'any' type`,
                });
                health -= anyTypes.length * 2;
            }

            const secrets = file.content.match(PATTERNS.SECRET_PATTERN);
            if (secrets) {
                issues.push({
                    type: "security",
                    severity: "critical",
                    message: `${secrets.length} potential secrets exposed`,
                });
                health -= 30;
            }

            const deepNesting = file.content.match(PATTERNS.DEEP_NESTING);
            if (deepNesting && deepNesting.length > 5) {
                issues.push({
                    type: "complexity",
                    severity: "medium",
                    message: `${deepNesting.length} instances of deep nesting`,
                });
                health -= 10;
            }

            return {
                path: file.path,
                health: Math.max(0, Math.min(100, health)),
                issues,
            };
        });
    }
}

/**
 * NEXUS PR Impact Simulator
 * Simulates production impact BEFORE merge
 */

import type { DiffContext } from "./types";

interface ImpactSimulation {
    performanceImpact: {
        latency: {
            p50: { before: number; after: number; delta: number };
            p95: { before: number; after: number; delta: number };
            p99: { before: number; after: number; delta: number };
        };
        throughput: { before: number; after: number; delta: number };
        memoryUsage: { before: number; after: number; delta: number };
        cpuUsage: { before: number; after: number; delta: number };
    };
    riskFactors: Array<{
        type: string;
        severity: "critical" | "high" | "medium" | "low";
        description: string;
        affectedPaths: string[];
    }>;
    errorPaths: Array<{
        scenario: string;
        probability: number;
        potentialImpact: string;
        mitigation: string;
    }>;
    suggestion: string[];
    confidence: number;
}

interface RequestSimulation {
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    expectedLatencyMs: number;
    errorProbability: number;
}

// Patterns that typically affect performance
const PERFORMANCE_PATTERNS = {
    DATABASE_QUERY: {
        patterns: [/\.query\(|\.find\(|\.findMany\(|\.select\(/i, /prisma\.|drizzle\./i],
        impact: { latencyDelta: 10, riskLevel: "medium" as const },
        description: "Database query added",
    },
    N_PLUS_ONE: {
        patterns: [/for\s*\([^)]*\)\s*\{[^}]*\.find/i, /\.map\([^)]*=>[^}]*query/i],
        impact: { latencyDelta: 50, riskLevel: "high" as const },
        description: "Potential N+1 query pattern",
    },
    EXTERNAL_API: {
        patterns: [/fetch\(|axios\.|http\./i],
        impact: { latencyDelta: 100, riskLevel: "high" as const },
        description: "External API call added",
    },
    SYNC_CRYPTO: {
        patterns: [/crypto\.|bcrypt\.|argon2/i],
        impact: { latencyDelta: 20, riskLevel: "medium" as const },
        description: "Cryptographic operation (can be slow)",
    },
    LARGE_LOOP: {
        patterns: [/for\s*\([^)]*;\s*\w+\s*[<>]=?\s*\d{4,}/i, /\.forEach\(|\.map\(/i],
        impact: { latencyDelta: 5, riskLevel: "low" as const },
        description: "Loop over potentially large dataset",
    },
    FILE_IO: {
        patterns: [/readFile|writeFile|fs\./i],
        impact: { latencyDelta: 15, riskLevel: "medium" as const },
        description: "File I/O operation",
    },
    MEMORY_INTENSIVE: {
        patterns: [/new\s+Array\([^)]*\d{4,}|Buffer\.alloc\(/i, /JSON\.parse\(|\.split\(/i],
        impact: { latencyDelta: 8, riskLevel: "medium" as const },
        description: "Memory-intensive operation",
    },
    BLOCKING_OPERATION: {
        patterns: [/Sync\(|\.wait\(|while\s*\(true\)/i],
        impact: { latencyDelta: 100, riskLevel: "critical" as const },
        description: "Potentially blocking operation",
    },
};

// Error-prone patterns
const ERROR_PATTERNS = {
    UNHANDLED_PROMISE: {
        pattern: /\.then\([^}]*\)(?!\s*\.catch)/i,
        description: "Unhandled promise rejection",
        probability: 0.3,
    },
    MISSING_NULL_CHECK: {
        pattern: /\.\w+\??\./,
        description: "Potential null/undefined access",
        probability: 0.2,
    },
    RACE_CONDITION: {
        pattern: /async[^}]*await[^}]*await/i,
        description: "Multiple awaits may cause race condition",
        probability: 0.1,
    },
    TIMEOUT_MISSING: {
        pattern: /fetch\((?![^)]*timeout)/i,
        description: "API call without timeout",
        probability: 0.4,
    },
};

export class ImpactSimulator {
    private baselineMetrics = {
        latency: { p50: 45, p95: 120, p99: 250 },
        throughput: 1000,
        memoryUsage: 256,
        cpuUsage: 30,
    };

    /**
     * Simulate the production impact of code changes
     */
    simulate(
        diffs: DiffContext[],
        options?: {
            requestCount?: number;
            userLoad?: "low" | "medium" | "high" | "peak";
        }
    ): ImpactSimulation {
        const requestCount = options?.requestCount || 1000;
        const loadMultiplier =
            options?.userLoad === "peak"
                ? 2
                : options?.userLoad === "high"
                    ? 1.5
                    : options?.userLoad === "low"
                        ? 0.5
                        : 1;

        const riskFactors: ImpactSimulation["riskFactors"] = [];
        const errorPaths: ImpactSimulation["errorPaths"] = [];
        const suggestions: string[] = [];

        let totalLatencyDelta = 0;
        let confidenceReduction = 0;

        // Analyze each diff for performance patterns
        for (const diff of diffs) {
            const addedLines = diff.diff
                .split("\n")
                .filter((l) => l.startsWith("+"))
                .join("\n");

            // Check performance patterns
            for (const [patternName, patternConfig] of Object.entries(
                PERFORMANCE_PATTERNS
            )) {
                for (const pattern of patternConfig.patterns) {
                    if (pattern.test(addedLines)) {
                        const matches = addedLines.match(pattern);
                        const occurrences = matches?.length || 1;

                        totalLatencyDelta += patternConfig.impact.latencyDelta * occurrences;

                        riskFactors.push({
                            type: patternName,
                            severity: patternConfig.impact.riskLevel,
                            description: `${patternConfig.description} (${occurrences}x)`,
                            affectedPaths: [diff.file],
                        });

                        // Generate suggestions
                        if (patternName === "N_PLUS_ONE") {
                            suggestions.push(
                                `Consider using eager loading or batch queries in ${diff.file}`
                            );
                        }
                        if (patternName === "EXTERNAL_API") {
                            suggestions.push(
                                `Add timeout and retry logic for external API calls in ${diff.file}`
                            );
                        }
                        if (patternName === "BLOCKING_OPERATION") {
                            suggestions.push(
                                `⚠️ Blocking operation detected - consider async alternative in ${diff.file}`
                            );
                        }
                    }
                }
            }

            // Check error patterns
            for (const [patternName, patternConfig] of Object.entries(ERROR_PATTERNS)) {
                if (patternConfig.pattern.test(addedLines)) {
                    errorPaths.push({
                        scenario: patternConfig.description,
                        probability: patternConfig.probability,
                        potentialImpact: `May cause failures in ${diff.file}`,
                        mitigation: this.getMitigation(patternName),
                    });
                    confidenceReduction += 0.05;
                }
            }
        }

        // Apply load multiplier
        totalLatencyDelta *= loadMultiplier;

        // Calculate final metrics
        const latencyDelta = Math.round(totalLatencyDelta);

        const performanceImpact: ImpactSimulation["performanceImpact"] = {
            latency: {
                p50: {
                    before: this.baselineMetrics.latency.p50,
                    after: this.baselineMetrics.latency.p50 + Math.round(latencyDelta * 0.5),
                    delta: Math.round(latencyDelta * 0.5),
                },
                p95: {
                    before: this.baselineMetrics.latency.p95,
                    after: this.baselineMetrics.latency.p95 + Math.round(latencyDelta * 1.2),
                    delta: Math.round(latencyDelta * 1.2),
                },
                p99: {
                    before: this.baselineMetrics.latency.p99,
                    after: this.baselineMetrics.latency.p99 + Math.round(latencyDelta * 2),
                    delta: Math.round(latencyDelta * 2),
                },
            },
            throughput: {
                before: this.baselineMetrics.throughput,
                after: Math.round(
                    this.baselineMetrics.throughput * (1 - latencyDelta / 500)
                ),
                delta: -Math.round(this.baselineMetrics.throughput * (latencyDelta / 500)),
            },
            memoryUsage: {
                before: this.baselineMetrics.memoryUsage,
                after: this.baselineMetrics.memoryUsage + Math.round(latencyDelta * 0.1),
                delta: Math.round(latencyDelta * 0.1),
            },
            cpuUsage: {
                before: this.baselineMetrics.cpuUsage,
                after: Math.min(
                    100,
                    this.baselineMetrics.cpuUsage + Math.round(latencyDelta * 0.05)
                ),
                delta: Math.round(latencyDelta * 0.05),
            },
        };

        // Add performance-based suggestions
        if (performanceImpact.latency.p99.delta > 50) {
            suggestions.unshift(
                "⚠️ Significant P99 latency increase - consider caching or optimization"
            );
        }
        if (performanceImpact.throughput.delta < -100) {
            suggestions.unshift(
                "⚠️ Throughput reduction detected - may impact capacity"
            );
        }

        // Calculate confidence
        const confidence = Math.max(
            0.5,
            0.85 - confidenceReduction - riskFactors.length * 0.02
        );

        return {
            performanceImpact,
            riskFactors,
            errorPaths,
            suggestion: suggestions,
            confidence: Math.round(confidence * 100) / 100,
        };
    }

    /**
     * Get historical baseline for comparison
     */
    setBaseline(metrics: typeof this.baselineMetrics): void {
        this.baselineMetrics = { ...metrics };
    }

    /**
     * Simulate specific request paths
     */
    simulateRequests(
        requests: RequestSimulation[],
        changes: DiffContext[]
    ): Array<{
        request: RequestSimulation;
        impact: { latencyChange: number; riskLevel: string };
    }> {
        return requests.map((request) => {
            const affectedChange = changes.find((c) =>
                request.path.toLowerCase().includes(c.file.replace(/\.(ts|js)$/, ""))
            );

            const latencyChange = affectedChange
                ? Math.random() * 30 + 10 // 10-40ms if file is affected
                : Math.random() * 5; // 0-5ms baseline noise

            return {
                request,
                impact: {
                    latencyChange: Math.round(latencyChange * 10) / 10,
                    riskLevel: latencyChange > 20 ? "high" : latencyChange > 10 ? "medium" : "low",
                },
            };
        });
    }

    private getMitigation(patternName: string): string {
        const mitigations: Record<string, string> = {
            UNHANDLED_PROMISE: "Add .catch() handler or use try/catch with async/await",
            MISSING_NULL_CHECK: "Add optional chaining (?.) or null checks",
            RACE_CONDITION: "Consider using Promise.all() or serialize operations",
            TIMEOUT_MISSING: "Add timeout option: fetch(url, { signal: AbortSignal.timeout(5000) })",
        };
        return mitigations[patternName] || "Review and add error handling";
    }
}

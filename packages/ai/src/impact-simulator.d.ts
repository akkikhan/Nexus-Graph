/**
 * NEXUS PR Impact Simulator
 * Simulates production impact BEFORE merge
 */
import type { DiffContext } from "./types";
interface ImpactSimulation {
    performanceImpact: {
        latency: {
            p50: {
                before: number;
                after: number;
                delta: number;
            };
            p95: {
                before: number;
                after: number;
                delta: number;
            };
            p99: {
                before: number;
                after: number;
                delta: number;
            };
        };
        throughput: {
            before: number;
            after: number;
            delta: number;
        };
        memoryUsage: {
            before: number;
            after: number;
            delta: number;
        };
        cpuUsage: {
            before: number;
            after: number;
            delta: number;
        };
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
export declare class ImpactSimulator {
    private baselineMetrics;
    /**
     * Simulate the production impact of code changes
     */
    simulate(diffs: DiffContext[], options?: {
        requestCount?: number;
        userLoad?: "low" | "medium" | "high" | "peak";
    }): ImpactSimulation;
    /**
     * Get historical baseline for comparison
     */
    setBaseline(metrics: typeof this.baselineMetrics): void;
    /**
     * Simulate specific request paths
     */
    simulateRequests(requests: RequestSimulation[], changes: DiffContext[]): Array<{
        request: RequestSimulation;
        impact: {
            latencyChange: number;
            riskLevel: string;
        };
    }>;
    private getMitigation;
}
export {};
//# sourceMappingURL=impact-simulator.d.ts.map
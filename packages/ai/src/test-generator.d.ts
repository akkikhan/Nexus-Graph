/**
 * NEXUS Smart Test Generator
 * AI generates missing tests with one click
 */
import { AIOrchestrator } from "./orchestrator";
import type { DiffContext } from "./types";
interface GeneratedTest {
    framework: "jest" | "vitest" | "mocha" | "playwright";
    targetFile: string;
    testFile: string;
    testCode: string;
    coverage: {
        functions: string[];
        branches: number;
        estimatedCoverage: number;
    };
}
interface TestSuggestion {
    functionName: string;
    filePath: string;
    testTypes: Array<{
        type: "unit" | "integration" | "e2e" | "edge_case" | "error_handling";
        description: string;
        priority: "high" | "medium" | "low";
        reason: string;
    }>;
}
export declare class SmartTestGenerator {
    private orchestrator;
    constructor(orchestrator: AIOrchestrator);
    /**
     * Generate tests for new or modified code
     */
    generateTests(code: string, options: {
        targetFile: string;
        functions: string[];
        framework?: "jest" | "vitest" | "mocha" | "playwright";
        language?: string;
    }): Promise<GeneratedTest>;
    /**
     * Analyze code and suggest what tests are needed
     */
    suggestTests(diffs: DiffContext[]): Promise<TestSuggestion[]>;
    /**
     * Generate edge case tests using AI analysis
     */
    generateEdgeCaseTests(code: string, functionName: string, framework?: "jest" | "vitest"): Promise<string>;
    private detectFramework;
    private detectLanguage;
    private generateTestFilePath;
    private extractCode;
    private extractFunctions;
    private extractFunctionContent;
    private estimateBranches;
    private estimateCoverage;
    private parseEdgeCases;
}
export {};
//# sourceMappingURL=test-generator.d.ts.map
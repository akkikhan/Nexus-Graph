/**
 * NEXUS AI Package - Main Export
 * Next-generation AI-powered code intelligence platform
 */

// Core types and orchestrator
export * from "./types";
export { AIOrchestrator } from "./orchestrator";

// Original engines
export { CodeReviewer } from "./code-reviewer";
export { RiskScorer } from "./risk-scorer";
export { AutoSplitter } from "./auto-splitter";

// 10X Revolutionary Engines
export { IntelligentModelRouter } from "./model-router";
export { AIEnsembleDebate } from "./ensemble-debate";
export { CodeIntentDetector } from "./intent-detector";
export { ConflictPredictor } from "./conflict-predictor";
export { ReviewFlowAnalyzer } from "./flow-analyzer";
export { CodeHealthScorer } from "./health-scorer";
export { SmartTestGenerator } from "./test-generator";
export { ImpactSimulator } from "./impact-simulator";

// Factory function for easy initialization
import type { AIConfig } from "./types";
import { AIOrchestrator } from "./orchestrator";
import { CodeReviewer } from "./code-reviewer";
import { RiskScorer } from "./risk-scorer";
import { AutoSplitter } from "./auto-splitter";
import { IntelligentModelRouter } from "./model-router";
import { AIEnsembleDebate } from "./ensemble-debate";
import { CodeIntentDetector } from "./intent-detector";
import { ConflictPredictor } from "./conflict-predictor";
import { ReviewFlowAnalyzer } from "./flow-analyzer";
import { CodeHealthScorer } from "./health-scorer";
import { SmartTestGenerator } from "./test-generator";
import { ImpactSimulator } from "./impact-simulator";

export interface NexusAI {
    // Core orchestration
    orchestrator: AIOrchestrator;

    // Original engines
    codeReviewer: CodeReviewer;
    riskScorer: RiskScorer;
    autoSplitter: AutoSplitter;

    // 10X Revolutionary Engines
    modelRouter: IntelligentModelRouter;
    ensembleDebate: AIEnsembleDebate;
    intentDetector: CodeIntentDetector;
    conflictPredictor: ConflictPredictor;
    flowAnalyzer: ReviewFlowAnalyzer;
    healthScorer: CodeHealthScorer;
    testGenerator: SmartTestGenerator;
    impactSimulator: ImpactSimulator;
}

export function createNexusAI(config: AIConfig): NexusAI {
    const orchestrator = new AIOrchestrator(config);

    return {
        // Core
        orchestrator,

        // Original engines
        codeReviewer: new CodeReviewer(orchestrator),
        riskScorer: new RiskScorer(orchestrator),
        autoSplitter: new AutoSplitter(orchestrator),

        // 10X Revolutionary Engines
        modelRouter: new IntelligentModelRouter(),
        ensembleDebate: new AIEnsembleDebate(orchestrator),
        intentDetector: new CodeIntentDetector(orchestrator),
        conflictPredictor: new ConflictPredictor(),
        flowAnalyzer: new ReviewFlowAnalyzer(),
        healthScorer: new CodeHealthScorer(),
        testGenerator: new SmartTestGenerator(orchestrator),
        impactSimulator: new ImpactSimulator(),
    };
}

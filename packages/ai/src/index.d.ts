/**
 * NEXUS AI Package - Main Export
 * Next-generation AI-powered code intelligence platform
 */
export * from "./types";
export { AIOrchestrator } from "./orchestrator";
export { CodeReviewer } from "./code-reviewer";
export { RiskScorer } from "./risk-scorer";
export { AutoSplitter } from "./auto-splitter";
export { IntelligentModelRouter } from "./model-router";
export { AIEnsembleDebate } from "./ensemble-debate";
export { CodeIntentDetector } from "./intent-detector";
export { ConflictPredictor } from "./conflict-predictor";
export { ReviewFlowAnalyzer } from "./flow-analyzer";
export { CodeHealthScorer } from "./health-scorer";
export { SmartTestGenerator } from "./test-generator";
export { ImpactSimulator } from "./impact-simulator";
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
    orchestrator: AIOrchestrator;
    codeReviewer: CodeReviewer;
    riskScorer: RiskScorer;
    autoSplitter: AutoSplitter;
    modelRouter: IntelligentModelRouter;
    ensembleDebate: AIEnsembleDebate;
    intentDetector: CodeIntentDetector;
    conflictPredictor: ConflictPredictor;
    flowAnalyzer: ReviewFlowAnalyzer;
    healthScorer: CodeHealthScorer;
    testGenerator: SmartTestGenerator;
    impactSimulator: ImpactSimulator;
}
export declare function createNexusAI(config: AIConfig): NexusAI;
//# sourceMappingURL=index.d.ts.map
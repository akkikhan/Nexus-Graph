/**
 * NEXUS AI Code Review Engine
 * Analyzes diffs and provides intelligent code review comments
 */
import { AIOrchestrator } from "./orchestrator";
import type { ReviewComment, DiffContext, CodebaseContext } from "./types";
export declare class CodeReviewer {
    private orchestrator;
    constructor(orchestrator: AIOrchestrator);
    /**
     * Review a code diff and return comments
     */
    reviewDiff(diffContext: DiffContext, codebaseContext?: CodebaseContext): Promise<ReviewComment[]>;
    /**
     * Review multiple diffs (full PR)
     */
    reviewPR(diffs: DiffContext[], codebaseContext?: CodebaseContext): Promise<ReviewComment[]>;
    /**
     * Parse AI response into structured comments
     */
    private parseReviewResponse;
    private validateCategory;
    private validateSeverity;
    private sortComments;
}
//# sourceMappingURL=code-reviewer.d.ts.map
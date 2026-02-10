/**
 * NEXUS Repository Layer - Stacks
 */
export interface CreateStackInput {
    repoId: string;
    userId: string;
    name: string;
    baseBranch?: string;
}
export interface AddBranchInput {
    stackId: string;
    repoId: string;
    name: string;
    position: number;
    parentBranchId?: string;
}
export declare const stackRepository: {
    /**
     * Create a new stack
     */
    create(input: CreateStackInput): Promise<{
        status: string;
        name: string;
        id: string;
        baseBranch: string;
        updatedAt: Date;
        createdAt: Date;
        userId: string;
        repoId: string;
    }>;
    /**
     * Find stack by ID
     */
    findById(id: string): Promise<{
        status: string;
        name: string;
        id: string;
        baseBranch: string;
        updatedAt: Date;
        createdAt: Date;
        userId: string;
        repoId: string;
        user: {
            [x: string]: any;
        } | {
            [x: string]: any;
        }[];
        branches: {
            [x: string]: any;
        }[];
        repository: {
            [x: string]: any;
        } | {
            [x: string]: any;
        }[];
    } | undefined>;
    /**
     * List stacks for a user
     */
    listForUser(userId: string, options?: {
        repoId?: string;
    }): Promise<{
        status: string;
        name: string;
        id: string;
        baseBranch: string;
        updatedAt: Date;
        createdAt: Date;
        userId: string;
        repoId: string;
        branches: {
            [x: string]: any;
        }[];
        repository: {
            [x: string]: any;
        } | {
            [x: string]: any;
        }[];
    }[]>;
    /**
     * Add a branch to a stack
     */
    addBranch(input: AddBranchInput): Promise<any>;
    /**
     * Update branch position
     */
    updateBranchPosition(branchId: string, position: number): Promise<{
        [x: string]: any;
    }>;
    /**
     * Link branch to PR
     */
    linkBranchToPR(branchId: string, pr: {
        number: number;
        url: string;
        title: string;
        status: any;
    }): Promise<{
        [x: string]: any;
    }>;
    /**
     * Get full stack with PR details
     */
    getWithPRDetails(id: string): Promise<{
        branches: ({
            pullRequest: null;
        } | {
            pullRequest: {
                number: number;
                status: "open" | "closed" | "merged" | "draft" | "approved" | "changes_requested";
                id: string;
                title: string;
                description: string | null;
                updatedAt: Date;
                mergedAt: Date | null;
                riskLevel: "high" | "critical" | "low" | "medium" | null;
                createdAt: Date;
                externalId: string;
                repoId: string;
                branchId: string | null;
                authorId: string;
                url: string;
                isDraft: boolean | null;
                linesAdded: number | null;
                linesRemoved: number | null;
                filesChanged: number | null;
                commitsCount: number | null;
                aiSummary: string | null;
                riskScore: number | null;
                riskFactors: unknown;
                estimatedReviewMinutes: number | null;
                publishedAt: Date | null;
                firstReviewAt: Date | null;
                approvedAt: Date | null;
                closedAt: Date | null;
            } | undefined;
        })[];
        status: string;
        name: string;
        id: string;
        baseBranch: string;
        updatedAt: Date;
        createdAt: Date;
        userId: string;
        repoId: string;
        user: {
            [x: string]: any;
        } | {
            [x: string]: any;
        }[];
        repository: {
            [x: string]: any;
        } | {
            [x: string]: any;
        }[];
    } | null>;
    /**
     * Mark stack as merged
     */
    markMerged(id: string): Promise<{
        id: string;
        repoId: string;
        userId: string;
        name: string;
        baseBranch: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Delete a stack
     */
    delete(id: string): Promise<void>;
};
//# sourceMappingURL=stack.d.ts.map
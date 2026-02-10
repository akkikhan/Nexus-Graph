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
        id: string;
        repoId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        baseBranch: string;
    }>;
    /**
     * Find stack by ID
     */
    findById(id: string): Promise<{
        status: string;
        id: string;
        repoId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        baseBranch: string;
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
        id: string;
        repoId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        baseBranch: string;
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
        branches: any[];
        status: string;
        id: string;
        repoId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        baseBranch: string;
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
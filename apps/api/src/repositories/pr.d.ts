/**
 * NEXUS Repository Layer - Pull Requests
 */
export interface CreatePRInput {
    repoId: string;
    branchId?: string;
    authorId: string;
    number: number;
    externalId: string;
    title: string;
    description?: string;
    url: string;
    isDraft?: boolean;
    linesAdded?: number;
    linesRemoved?: number;
    filesChanged?: number;
}
export interface UpdatePRInput {
    title?: string;
    description?: string;
    status?: "draft" | "open" | "approved" | "changes_requested" | "merged" | "closed";
    isDraft?: boolean;
    aiSummary?: string;
    riskScore?: number;
    riskLevel?: "low" | "medium" | "high" | "critical";
    riskFactors?: any[];
    estimatedReviewMinutes?: number;
}
export declare const prRepository: {
    /**
     * Create a new pull request
     */
    create(input: CreatePRInput): Promise<{
        number: number;
        status: "draft" | "open" | "approved" | "changes_requested" | "merged" | "closed";
        id: string;
        repoId: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        externalId: string;
        branchId: string | null;
        authorId: string;
        title: string;
        url: string;
        isDraft: boolean | null;
        linesAdded: number | null;
        linesRemoved: number | null;
        filesChanged: number | null;
        commitsCount: number | null;
        aiSummary: string | null;
        riskScore: number | null;
        riskLevel: "low" | "medium" | "high" | "critical" | null;
        riskFactors: unknown;
        estimatedReviewMinutes: number | null;
        publishedAt: Date | null;
        firstReviewAt: Date | null;
        approvedAt: Date | null;
        mergedAt: Date | null;
        closedAt: Date | null;
    }>;
    /**
     * Find PR by ID
     */
    findById(id: string): Promise<{
        number: number;
        status: "draft" | "open" | "approved" | "changes_requested" | "merged" | "closed";
        id: string;
        repoId: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        externalId: string;
        branchId: string | null;
        authorId: string;
        title: string;
        url: string;
        isDraft: boolean | null;
        linesAdded: number | null;
        linesRemoved: number | null;
        filesChanged: number | null;
        commitsCount: number | null;
        aiSummary: string | null;
        riskScore: number | null;
        riskLevel: "low" | "medium" | "high" | "critical" | null;
        riskFactors: unknown;
        estimatedReviewMinutes: number | null;
        publishedAt: Date | null;
        firstReviewAt: Date | null;
        approvedAt: Date | null;
        mergedAt: Date | null;
        closedAt: Date | null;
        comments: {
            [x: string]: any;
        }[];
        reviews: {
            [x: string]: any;
        }[];
        repository: {
            [x: string]: any;
        } | {
            [x: string]: any;
        }[];
        author: {
            [x: string]: any;
        } | {
            [x: string]: any;
        }[];
    } | undefined>;
    /**
     * Find PR by repo and number
     */
    findByRepoAndNumber(repoId: string, number: number): Promise<{
        number: number;
        status: "draft" | "open" | "approved" | "changes_requested" | "merged" | "closed";
        id: string;
        repoId: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        externalId: string;
        branchId: string | null;
        authorId: string;
        title: string;
        url: string;
        isDraft: boolean | null;
        linesAdded: number | null;
        linesRemoved: number | null;
        filesChanged: number | null;
        commitsCount: number | null;
        aiSummary: string | null;
        riskScore: number | null;
        riskLevel: "low" | "medium" | "high" | "critical" | null;
        riskFactors: unknown;
        estimatedReviewMinutes: number | null;
        publishedAt: Date | null;
        firstReviewAt: Date | null;
        approvedAt: Date | null;
        mergedAt: Date | null;
        closedAt: Date | null;
        repository: {
            [x: string]: any;
        } | {
            [x: string]: any;
        }[];
        author: {
            [x: string]: any;
        } | {
            [x: string]: any;
        }[];
    } | undefined>;
    /**
     * List PRs with filters
     */
    list(options: {
        repoId?: string;
        authorId?: string;
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        number: number;
        status: "draft" | "open" | "approved" | "changes_requested" | "merged" | "closed";
        id: string;
        repoId: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        externalId: string;
        branchId: string | null;
        authorId: string;
        title: string;
        url: string;
        isDraft: boolean | null;
        linesAdded: number | null;
        linesRemoved: number | null;
        filesChanged: number | null;
        commitsCount: number | null;
        aiSummary: string | null;
        riskScore: number | null;
        riskLevel: "low" | "medium" | "high" | "critical" | null;
        riskFactors: unknown;
        estimatedReviewMinutes: number | null;
        publishedAt: Date | null;
        firstReviewAt: Date | null;
        approvedAt: Date | null;
        mergedAt: Date | null;
        closedAt: Date | null;
        repository: {
            [x: string]: any;
        } | {
            [x: string]: any;
        }[];
        author: {
            [x: string]: any;
        } | {
            [x: string]: any;
        }[];
    }[]>;
    /**
     * Update a PR
     */
    update(id: string, input: UpdatePRInput): Promise<{
        id: string;
        branchId: string | null;
        repoId: string;
        authorId: string;
        number: number;
        externalId: string;
        title: string;
        description: string | null;
        url: string;
        status: "draft" | "open" | "approved" | "changes_requested" | "merged" | "closed";
        isDraft: boolean | null;
        linesAdded: number | null;
        linesRemoved: number | null;
        filesChanged: number | null;
        commitsCount: number | null;
        aiSummary: string | null;
        riskScore: number | null;
        riskLevel: "low" | "medium" | "high" | "critical" | null;
        riskFactors: unknown;
        estimatedReviewMinutes: number | null;
        publishedAt: Date | null;
        firstReviewAt: Date | null;
        approvedAt: Date | null;
        mergedAt: Date | null;
        closedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Update AI analysis results
     */
    updateAIAnalysis(id: string, analysis: {
        aiSummary: string;
        riskScore: number;
        riskLevel: "low" | "medium" | "high" | "critical";
        riskFactors: any[];
        estimatedReviewMinutes: number;
    }): Promise<{
        id: string;
        branchId: string | null;
        repoId: string;
        authorId: string;
        number: number;
        externalId: string;
        title: string;
        description: string | null;
        url: string;
        status: "draft" | "open" | "approved" | "changes_requested" | "merged" | "closed";
        isDraft: boolean | null;
        linesAdded: number | null;
        linesRemoved: number | null;
        filesChanged: number | null;
        commitsCount: number | null;
        aiSummary: string | null;
        riskScore: number | null;
        riskLevel: "low" | "medium" | "high" | "critical" | null;
        riskFactors: unknown;
        estimatedReviewMinutes: number | null;
        publishedAt: Date | null;
        firstReviewAt: Date | null;
        approvedAt: Date | null;
        mergedAt: Date | null;
        closedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Get PRs pending review for a user
     */
    getPendingReviews(userId: string): Promise<{
        number: number;
        status: "draft" | "open" | "approved" | "changes_requested" | "merged" | "closed";
        id: string;
        repoId: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        externalId: string;
        branchId: string | null;
        authorId: string;
        title: string;
        url: string;
        isDraft: boolean | null;
        linesAdded: number | null;
        linesRemoved: number | null;
        filesChanged: number | null;
        commitsCount: number | null;
        aiSummary: string | null;
        riskScore: number | null;
        riskLevel: "low" | "medium" | "high" | "critical" | null;
        riskFactors: unknown;
        estimatedReviewMinutes: number | null;
        publishedAt: Date | null;
        firstReviewAt: Date | null;
        approvedAt: Date | null;
        mergedAt: Date | null;
        closedAt: Date | null;
        repository: {
            [x: string]: any;
        } | {
            [x: string]: any;
        }[];
        author: {
            [x: string]: any;
        } | {
            [x: string]: any;
        }[];
    }[]>;
    /**
     * Get PR statistics for a repository
     */
    getStats(repoId: string): Promise<{
        total: number;
        open: number;
        merged: number;
        avgRiskScore: number;
        avgTimeToMerge: number;
    }>;
    /**
     * Mark PR as merged
     */
    markMerged(id: string): Promise<{
        id: string;
        branchId: string | null;
        repoId: string;
        authorId: string;
        number: number;
        externalId: string;
        title: string;
        description: string | null;
        url: string;
        status: "draft" | "open" | "approved" | "changes_requested" | "merged" | "closed";
        isDraft: boolean | null;
        linesAdded: number | null;
        linesRemoved: number | null;
        filesChanged: number | null;
        commitsCount: number | null;
        aiSummary: string | null;
        riskScore: number | null;
        riskLevel: "low" | "medium" | "high" | "critical" | null;
        riskFactors: unknown;
        estimatedReviewMinutes: number | null;
        publishedAt: Date | null;
        firstReviewAt: Date | null;
        approvedAt: Date | null;
        mergedAt: Date | null;
        closedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
};
//# sourceMappingURL=pr.d.ts.map
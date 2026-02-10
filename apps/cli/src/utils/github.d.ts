/**
 * NEXUS CLI - GitHub API Client
 */
interface CreatePROptions {
    title: string;
    head: string;
    base: string;
    body?: string;
    draft?: boolean;
}
interface UpdatePROptions {
    title?: string;
    body?: string;
    base?: string;
    state?: "open" | "closed";
}
interface PullRequest {
    number: number;
    title: string;
    html_url: string;
    state: string;
    draft: boolean;
    base: {
        ref: string;
    };
    head: {
        ref: string;
    };
}
export declare class GitHubAPI {
    private token;
    private baseUrl;
    constructor(token: string);
    private request;
    findPR(owner: string, repo: string, head: string): Promise<PullRequest | null>;
    createPR(owner: string, repo: string, options: CreatePROptions): Promise<PullRequest>;
    updatePR(owner: string, repo: string, number: number, options: UpdatePROptions): Promise<PullRequest>;
    getPR(owner: string, repo: string, number: number): Promise<PullRequest>;
    getReviewers(owner: string, repo: string, number: number): Promise<Array<{
        login: string;
    }>>;
    requestReviewers(owner: string, repo: string, number: number, reviewers: string[]): Promise<void>;
    createComment(owner: string, repo: string, number: number, body: string): Promise<void>;
    createReviewComment(owner: string, repo: string, number: number, body: string, path: string, line: number, side?: "LEFT" | "RIGHT"): Promise<void>;
}
export {};
//# sourceMappingURL=github.d.ts.map
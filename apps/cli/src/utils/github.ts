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

export class GitHubAPI {
    private token: string;
    private baseUrl = "https://api.github.com";

    constructor(token: string) {
        this.token = token;
    }

    private async request<T>(
        method: string,
        endpoint: string,
        body?: object
    ): Promise<T> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method,
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GitHub API error: ${response.status} - ${error}`);
        }

        return response.json();
    }

    async findPR(
        owner: string,
        repo: string,
        head: string
    ): Promise<PullRequest | null> {
        const prs = await this.request<PullRequest[]>(
            "GET",
            `/repos/${owner}/${repo}/pulls?head=${owner}:${head}&state=open`
        );

        return prs[0] || null;
    }

    async createPR(
        owner: string,
        repo: string,
        options: CreatePROptions
    ): Promise<PullRequest> {
        return this.request<PullRequest>(
            "POST",
            `/repos/${owner}/${repo}/pulls`,
            options
        );
    }

    async updatePR(
        owner: string,
        repo: string,
        number: number,
        options: UpdatePROptions
    ): Promise<PullRequest> {
        return this.request<PullRequest>(
            "PATCH",
            `/repos/${owner}/${repo}/pulls/${number}`,
            options
        );
    }

    async getPR(
        owner: string,
        repo: string,
        number: number
    ): Promise<PullRequest> {
        return this.request<PullRequest>(
            "GET",
            `/repos/${owner}/${repo}/pulls/${number}`
        );
    }

    async getReviewers(
        owner: string,
        repo: string,
        number: number
    ): Promise<Array<{ login: string }>> {
        const response = await this.request<{
            users: Array<{ login: string }>;
            teams: Array<{ slug: string }>;
        }>("GET", `/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`);

        return response.users;
    }

    async requestReviewers(
        owner: string,
        repo: string,
        number: number,
        reviewers: string[]
    ): Promise<void> {
        await this.request(
            "POST",
            `/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`,
            { reviewers }
        );
    }

    async createComment(
        owner: string,
        repo: string,
        number: number,
        body: string
    ): Promise<void> {
        await this.request(
            "POST",
            `/repos/${owner}/${repo}/issues/${number}/comments`,
            { body }
        );
    }

    async createReviewComment(
        owner: string,
        repo: string,
        number: number,
        body: string,
        path: string,
        line: number,
        side: "LEFT" | "RIGHT" = "RIGHT"
    ): Promise<void> {
        const commit = await this.request<{ sha: string }>(
            "GET",
            `/repos/${owner}/${repo}/pulls/${number}`
        ).then((pr: any) => pr.head.sha);

        await this.request(
            "POST",
            `/repos/${owner}/${repo}/pulls/${number}/comments`,
            {
                body,
                path,
                line,
                side,
                commit_id: commit,
            }
        );
    }
}

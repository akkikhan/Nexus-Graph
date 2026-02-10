/**
 * NEXUS CLI - GitHub API Client
 */
export class GitHubAPI {
    token;
    baseUrl = "https://api.github.com";
    constructor(token) {
        this.token = token;
    }
    async request(method, endpoint, body) {
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
    async findPR(owner, repo, head) {
        const prs = await this.request("GET", `/repos/${owner}/${repo}/pulls?head=${owner}:${head}&state=open`);
        return prs[0] || null;
    }
    async createPR(owner, repo, options) {
        return this.request("POST", `/repos/${owner}/${repo}/pulls`, options);
    }
    async updatePR(owner, repo, number, options) {
        return this.request("PATCH", `/repos/${owner}/${repo}/pulls/${number}`, options);
    }
    async getPR(owner, repo, number) {
        return this.request("GET", `/repos/${owner}/${repo}/pulls/${number}`);
    }
    async getReviewers(owner, repo, number) {
        const response = await this.request("GET", `/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`);
        return response.users;
    }
    async requestReviewers(owner, repo, number, reviewers) {
        await this.request("POST", `/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`, { reviewers });
    }
    async createComment(owner, repo, number, body) {
        await this.request("POST", `/repos/${owner}/${repo}/issues/${number}/comments`, { body });
    }
    async createReviewComment(owner, repo, number, body, path, line, side = "RIGHT") {
        const commit = await this.request("GET", `/repos/${owner}/${repo}/pulls/${number}`).then((pr) => pr.head.sha);
        await this.request("POST", `/repos/${owner}/${repo}/pulls/${number}/comments`, {
            body,
            path,
            line,
            side,
            commit_id: commit,
        });
    }
}
//# sourceMappingURL=github.js.map
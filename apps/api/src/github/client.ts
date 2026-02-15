/**
 * GitHub REST client helpers (minimal).
 */

type GitHubPullRequestFile = {
    sha?: string;
    filename: string;
    status?: string;
    additions?: number;
    deletions?: number;
    changes?: number;
    patch?: string;
};

async function ghFetchJson<T>(url: string, token: string): Promise<T> {
    const resp = await fetch(url, {
        headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "nexus-api",
        },
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`GitHub API error (${resp.status}) for ${url}: ${text}`);
    }
    return (await resp.json()) as T;
}

export async function listPullRequestFiles(params: {
    owner: string;
    repo: string;
    pullNumber: number;
    token: string;
    maxPages?: number;
}): Promise<GitHubPullRequestFile[]> {
    const perPage = 100;
    const maxPages = Math.max(1, Math.min(params.maxPages ?? 10, 30));
    const all: GitHubPullRequestFile[] = [];

    for (let page = 1; page <= maxPages; page++) {
        const url = `https://api.github.com/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
            params.repo
        )}/pulls/${params.pullNumber}/files?per_page=${perPage}&page=${page}`;

        const batch = await ghFetchJson<GitHubPullRequestFile[]>(url, params.token);
        all.push(...batch);

        if (batch.length < perPage) break;
    }

    return all;
}


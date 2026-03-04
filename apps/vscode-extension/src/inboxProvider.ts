import * as vscode from "vscode";
import type { PullRequest } from "./types";
import { NexusClient } from "./nexusClient";

class NexusMessageItem extends vscode.TreeItem {
    constructor(label: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = "nexusMessage";
    }
}

export class NexusPullRequestItem extends vscode.TreeItem {
    constructor(readonly pr: PullRequest) {
        super(`#${pr.number} ${pr.title}`, vscode.TreeItemCollapsibleState.None);
        this.description = `${pr.repository.name} (${pr.status})`;
        this.tooltip = [
            `Repository: ${pr.repository.name}`,
            `Author: ${pr.author.username}`,
            `Status: ${pr.status}`,
            `Risk: ${pr.riskLevel}`,
        ].join("\n");
        this.contextValue = "nexusPullRequest";
        this.command = {
            command: "nexus.pullRequestActions",
            title: "Pull Request Actions",
            arguments: [this],
        };
    }
}

type NexusInboxNode = NexusPullRequestItem | NexusMessageItem;

export class NexusInboxProvider implements vscode.TreeDataProvider<NexusInboxNode> {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<NexusInboxNode | undefined>();
    readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    private items: NexusPullRequestItem[] = [];
    private message = "Nexus Inbox not loaded yet.";

    constructor(
        private readonly clientFactory: () => NexusClient,
        private readonly inboxLimitFactory: () => number
    ) {}

    async refresh(): Promise<void> {
        try {
            const client = this.clientFactory();
            const prs = await client.listPullRequests({
                status: "open",
                limit: this.inboxLimitFactory(),
                offset: 0,
            });
            this.items = prs.map((pr) => new NexusPullRequestItem(pr));
            this.message = prs.length > 0 ? "" : "No open pull requests in Nexus inbox.";
        } catch (error) {
            const text = error instanceof Error ? error.message : "Unknown error";
            this.items = [];
            this.message = `Unable to load Nexus inbox: ${text}`;
        }
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    getTreeItem(element: NexusInboxNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: NexusInboxNode): Thenable<NexusInboxNode[]> {
        if (element) return Promise.resolve([]);
        if (this.items.length > 0) return Promise.resolve(this.items);
        return Promise.resolve([new NexusMessageItem(this.message)]);
    }

    getPullRequests(): PullRequest[] {
        return this.items.map((item) => item.pr);
    }
}


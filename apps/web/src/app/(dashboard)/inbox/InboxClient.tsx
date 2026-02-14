"use client";

import { motion } from "framer-motion";
import {
    MessageSquare,
    GitPullRequest,
    Clock,
    AlertCircle,
    CheckCircle2,
    Search,
    Filter,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchPRs, PullRequest } from "../../../lib/api";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const statusColors = {
    open: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    closed: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    merged: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    draft: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
    // Keep existing for legacy/mock compatibility if needed
    needs_review: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    approved: "bg-green-500/10 text-green-500 border-green-500/20",
    changes_requested: "bg-red-500/10 text-red-500 border-red-500/20",
};

const riskColors = {
    low: "bg-risk-low",
    medium: "bg-risk-medium",
    high: "bg-risk-high",
    critical: "bg-risk-critical",
};

const STATUS_FILTERS = ["all", "open", "merged", "draft"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function parseStatusFilter(value: string | null): StatusFilter {
    if (value === "open" || value === "merged" || value === "draft") return value;
    return "all";
}

export default function InboxClient() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const statusFilter = parseStatusFilter(searchParams.get("status"));
    const search = searchParams.get("q") || "";

    const updateQuery = (updates: { status?: StatusFilter; q?: string }) => {
        const params = new URLSearchParams(searchParams.toString());

        if (updates.status !== undefined) {
            if (updates.status === "all") {
                params.delete("status");
            } else {
                params.set("status", updates.status);
            }
        }

        if (updates.q !== undefined) {
            if (!updates.q.trim()) {
                params.delete("q");
            } else {
                params.set("q", updates.q);
            }
        }

        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
    };

    const { data: prs, isLoading, error } = useQuery({
        queryKey: ["prs", statusFilter],
        queryFn: () =>
            fetchPRs({
                status:
                    statusFilter === "draft" || statusFilter === "all"
                        ? "all"
                        : statusFilter,
            }),
    });

    const prList = useMemo(() => {
        const list: PullRequest[] = prs || [];
        const byStatus =
            statusFilter === "all"
                ? list
                : list.filter((pr: PullRequest) => pr.status === statusFilter);
        if (!search.trim()) return byStatus;
        const q = search.trim().toLowerCase();
        return byStatus.filter(
            (pr: PullRequest) =>
                pr.title.toLowerCase().includes(q) ||
                pr.repository.name.toLowerCase().includes(q) ||
                pr.author.username.toLowerCase().includes(q)
        );
    }, [prs, search, statusFilter]);

    const stats = {
        open: prList.filter((pr: PullRequest) => pr.status === "open").length,
        merged: prList.filter((pr: PullRequest) => pr.status === "merged").length,
        critical: prList.filter((pr: PullRequest) => pr.riskLevel === "critical").length,
        total: prList.length,
    };

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-nexus-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8">
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                    Error loading PRs: {(error as Error).message}
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
            >
                <h1 className="text-3xl font-bold text-white">PR Inbox</h1>
                <p className="text-zinc-400">Review and manage pull requests assigned to you</p>
            </motion.div>

            {/* Search and Filters */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex gap-4 items-center"
            >
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        value={search}
                        onChange={(e) => updateQuery({ q: e.target.value })}
                        placeholder="Search pull requests..."
                        className="w-full pl-11 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-nexus-500 transition-colors"
                    />
                </div>

                <div className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 rounded-xl p-1">
                    <div className="px-3 py-2 text-zinc-500">
                        <Filter className="w-4 h-4" />
                    </div>
                    {STATUS_FILTERS.map((s) => (
                        <button
                            key={s}
                            onClick={() => updateQuery({ status: s })}
                            className={[
                                "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                                statusFilter === s
                                    ? "bg-nexus-500 text-white"
                                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50",
                            ].join(" ")}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: "Open PRs", value: stats.open, icon: Clock, color: "text-blue-500" },
                    {
                        label: "Merged",
                        value: stats.merged,
                        icon: CheckCircle2,
                        color: "text-purple-500",
                    },
                    {
                        label: "Critical Risk",
                        value: stats.critical,
                        icon: AlertCircle,
                        color: "text-red-500",
                    },
                    {
                        label: "Total PRs",
                        value: stats.total,
                        icon: GitPullRequest,
                        color: "text-nexus-500",
                    },
                ].map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.05 }}
                        className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <stat.icon className={`w-5 h-5 ${stat.color}`} />
                            <span className="text-2xl font-bold text-white">{stat.value}</span>
                        </div>
                        <p className="text-sm text-zinc-400">{stat.label}</p>
                    </motion.div>
                ))}
            </div>

            {/* PR List */}
            <div className="space-y-3">
                {prList.map((pr: PullRequest, i: number) => (
                    <motion.div
                        key={pr.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.05 }}
                        className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors cursor-pointer group"
                        onClick={() => router.push(`/inbox/${pr.id}`)}
                    >
                        <div className="flex items-start gap-4">
                            <div className="flex flex-col items-center gap-1">
                                <div
                                    className={`w-2 h-full min-h-[60px] rounded-full ${riskColors[pr.riskLevel]}`}
                                />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                    <h3 className="text-lg font-medium text-white group-hover:text-nexus-400 transition-colors truncate">
                                        {pr.title}
                                    </h3>
                                    <span
                                        className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${statusColors[pr.status] || statusColors.open}`}
                                    >
                                        {pr.status.replace("_", " ")}
                                    </span>
                                </div>

                                <p className="text-sm text-zinc-400 mb-2">{pr.aiSummary}</p>

                                <div className="flex items-center gap-4 text-xs text-zinc-500">
                                    <span>{pr.repository.name}</span>
                                    <span>by @{pr.author.username}</span>
                                    <span className="flex items-center gap-1">
                                        <MessageSquare className="w-3 h-3" />
                                        {pr.comments || 0}
                                    </span>
                                    <span className="text-green-500">+{pr.linesAdded || 0}</span>
                                    <span className="text-red-500">-{pr.linesRemoved || 0}</span>
                                    <span>{new Date(pr.updatedAt).toLocaleDateString()}</span>
                                </div>
                            </div>

                            <div className="text-right">
                                <div
                                    className={`text-2xl font-bold ${
                                        pr.riskScore >= 75
                                            ? "text-risk-critical"
                                            : pr.riskScore >= 50
                                                ? "text-risk-high"
                                                : pr.riskScore >= 25
                                                    ? "text-risk-medium"
                                                    : "text-risk-low"
                                    }`}
                                >
                                    {pr.riskScore}
                                </div>
                                <div className="text-xs text-zinc-500 uppercase">Risk</div>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}


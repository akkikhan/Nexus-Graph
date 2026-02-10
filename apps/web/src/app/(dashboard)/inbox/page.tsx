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

// Mock data for the PR inbox
const mockPRs = [
    {
        id: 1,
        title: "Add user authentication system",
        repo: "nexus/platform",
        author: "johndoe",
        authorAvatar: "",
        status: "needs_review",
        riskLevel: "high",
        riskScore: 72,
        comments: 3,
        updatedAt: "2 hours ago",
        linesAdded: 450,
        linesRemoved: 23,
        aiSummary: "Implements JWT-based authentication with OAuth support",
    },
    {
        id: 2,
        title: "Fix payment processing edge case",
        repo: "nexus/billing",
        author: "janesmith",
        authorAvatar: "",
        status: "approved",
        riskLevel: "critical",
        riskScore: 89,
        comments: 12,
        updatedAt: "30 minutes ago",
        linesAdded: 45,
        linesRemoved: 12,
        aiSummary: "Critical fix for race condition in payment callbacks",
    },
    {
        id: 3,
        title: "Update dependencies to latest versions",
        repo: "nexus/platform",
        author: "devbot",
        authorAvatar: "",
        status: "needs_review",
        riskLevel: "low",
        riskScore: 15,
        comments: 0,
        updatedAt: "1 day ago",
        linesAdded: 89,
        linesRemoved: 67,
        aiSummary: "Routine dependency updates, all tests passing",
    },
    {
        id: 4,
        title: "Refactor database queries for performance",
        repo: "nexus/api",
        author: "alexdev",
        authorAvatar: "",
        status: "changes_requested",
        riskLevel: "medium",
        riskScore: 45,
        comments: 7,
        updatedAt: "5 hours ago",
        linesAdded: 234,
        linesRemoved: 178,
        aiSummary: "Optimizes N+1 queries, adds connection pooling",
    },
];

const statusColors = {
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

export default function InboxPage() {
    return (
        <div className="p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">PR Inbox</h1>
                <p className="text-zinc-400">
                    Review and manage pull requests assigned to you
                </p>
            </div>

            {/* Filters */}
            <div className="flex gap-4 mb-6">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search pull requests..."
                        className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-nexus-500/50"
                    />
                </div>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
                    <Filter className="w-4 h-4" />
                    Filter
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-8">
                {[
                    { label: "Needs Review", value: 12, icon: Clock, color: "text-yellow-500" },
                    { label: "Approved", value: 8, icon: CheckCircle2, color: "text-green-500" },
                    { label: "Changes Requested", value: 3, icon: AlertCircle, color: "text-red-500" },
                    { label: "Total PRs", value: 23, icon: GitPullRequest, color: "text-nexus-500" },
                ].map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
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
                {mockPRs.map((pr, i) => (
                    <motion.div
                        key={pr.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.1 }}
                        className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors cursor-pointer group"
                    >
                        <div className="flex items-start gap-4">
                            {/* Risk indicator */}
                            <div className="flex flex-col items-center gap-1">
                                <div
                                    className={`w-2 h-full min-h-[60px] rounded-full ${riskColors[pr.riskLevel as keyof typeof riskColors]}`}
                                />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                    <h3 className="text-lg font-medium text-white group-hover:text-nexus-400 transition-colors truncate">
                                        {pr.title}
                                    </h3>
                                    <span
                                        className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${statusColors[pr.status as keyof typeof statusColors]}`}
                                    >
                                        {pr.status.replace("_", " ")}
                                    </span>
                                </div>

                                <p className="text-sm text-zinc-400 mb-2">{pr.aiSummary}</p>

                                <div className="flex items-center gap-4 text-xs text-zinc-500">
                                    <span>{pr.repo}</span>
                                    <span>by @{pr.author}</span>
                                    <span className="flex items-center gap-1">
                                        <MessageSquare className="w-3 h-3" />
                                        {pr.comments}
                                    </span>
                                    <span className="text-green-500">+{pr.linesAdded}</span>
                                    <span className="text-red-500">-{pr.linesRemoved}</span>
                                    <span>{pr.updatedAt}</span>
                                </div>
                            </div>

                            {/* Risk score */}
                            <div className="text-right">
                                <div
                                    className={`text-2xl font-bold ${pr.riskScore >= 75
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

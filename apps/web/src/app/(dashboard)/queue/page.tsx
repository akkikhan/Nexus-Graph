"use client";

import { motion } from "framer-motion";
import {
    Clock,
    GitMerge,
    GitPullRequest,
    CheckCircle,
    XCircle,
    Play,
    Pause,
    RotateCcw,
    AlertTriangle,
    Zap,
} from "lucide-react";

// Mock merge queue data
const queueItems = [
    {
        id: "queue-1",
        position: 1,
        pr: {
            number: 234,
            title: "Add user authentication with OAuth",
            author: { username: "johndoe", avatar: "" },
            repository: "nexus/platform",
        },
        status: "running",
        ciStatus: "in_progress",
        ciProgress: 65,
        estimatedTimeRemaining: "4m",
        addedAt: "10 minutes ago",
        attempts: 1,
    },
    {
        id: "queue-2",
        position: 2,
        pr: {
            number: 231,
            title: "Fix payment race condition",
            author: { username: "janedoe", avatar: "" },
            repository: "nexus/billing",
        },
        status: "pending",
        ciStatus: "waiting",
        estimatedTimeRemaining: "~12m",
        addedAt: "8 minutes ago",
        attempts: 0,
        priority: "high",
    },
    {
        id: "queue-3",
        position: 3,
        pr: {
            number: 228,
            title: "Update dependencies",
            author: { username: "dependabot", avatar: "" },
            repository: "nexus/platform",
        },
        status: "pending",
        ciStatus: "waiting",
        estimatedTimeRemaining: "~18m",
        addedAt: "5 minutes ago",
        attempts: 0,
    },
    {
        id: "queue-4",
        position: 4,
        pr: {
            number: 225,
            title: "Refactor API client",
            author: { username: "mike", avatar: "" },
            repository: "nexus/sdk",
        },
        status: "pending",
        ciStatus: "waiting",
        estimatedTimeRemaining: "~25m",
        addedAt: "2 minutes ago",
        attempts: 0,
    },
];

const recentMerges = [
    {
        pr: { number: 220, title: "Add error boundaries" },
        status: "merged",
        mergedAt: "15 minutes ago",
        duration: "3m 42s",
    },
    {
        pr: { number: 218, title: "Fix memory leak in worker" },
        status: "merged",
        mergedAt: "32 minutes ago",
        duration: "5m 18s",
    },
    {
        pr: { number: 215, title: "Optimize database queries" },
        status: "failed",
        failedAt: "1 hour ago",
        reason: "Flaky test in payment module",
        attempts: 3,
    },
];

export default function QueuePage() {
    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Merge Queue</h1>
                    <p className="text-zinc-400">
                        Automated, conflict-free merging with AI-powered CI optimization
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors">
                        <Pause className="w-4 h-4" />
                        Pause Queue
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-nexus-600 hover:bg-nexus-500 rounded-lg text-sm font-medium transition-colors">
                        <Zap className="w-4 h-4" />
                        Enable Turbo Mode
                    </button>
                </div>
            </div>

            {/* Queue Stats */}
            <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-zinc-400 text-sm">Queue Length</span>
                        <GitMerge className="w-4 h-4 text-nexus-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">{queueItems.length}</div>
                    <div className="text-xs text-zinc-500">PRs waiting</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-zinc-400 text-sm">Avg Wait Time</span>
                        <Clock className="w-4 h-4 text-yellow-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">8m</div>
                    <div className="text-xs text-zinc-500">-2m from yesterday</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-zinc-400 text-sm">Success Rate</span>
                        <CheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">94%</div>
                    <div className="text-xs text-zinc-500">Last 24 hours</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-zinc-400 text-sm">Throughput</span>
                        <GitPullRequest className="w-4 h-4 text-purple-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">24/day</div>
                    <div className="text-xs text-zinc-500">+6 from last week</div>
                </div>
            </div>

            {/* Active Queue */}
            <div className="mb-8">
                <h2 className="text-lg font-semibold text-white mb-4">Active Queue</h2>
                <div className="space-y-3">
                    {queueItems.map((item, index) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className={`p-4 rounded-xl border ${item.status === "running"
                                    ? "bg-nexus-950/30 border-nexus-500/30"
                                    : "bg-zinc-900/50 border-zinc-800"
                                }`}
                        >
                            <div className="flex items-center gap-4">
                                {/* Position */}
                                <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${item.status === "running"
                                            ? "bg-nexus-500 text-white"
                                            : "bg-zinc-800 text-zinc-400"
                                        }`}
                                >
                                    {item.position}
                                </div>

                                {/* PR Info */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-zinc-500 text-sm">
                                            {item.pr.repository}
                                        </span>
                                        <span className="text-zinc-600">•</span>
                                        <span className="text-zinc-500 text-sm">
                                            #{item.pr.number}
                                        </span>
                                        {item.priority === "high" && (
                                            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                                                Priority
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-white font-medium">{item.pr.title}</h3>
                                    <div className="text-xs text-zinc-500 mt-1">
                                        by @{item.pr.author.username} • Added {item.addedAt}
                                    </div>
                                </div>

                                {/* Status */}
                                <div className="text-right">
                                    {item.status === "running" ? (
                                        <div>
                                            <div className="flex items-center gap-2 text-nexus-400 text-sm">
                                                <Play className="w-4 h-4 animate-pulse" />
                                                CI Running
                                            </div>
                                            <div className="w-32 h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
                                                <motion.div
                                                    className="h-full bg-nexus-500"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${item.ciProgress}%` }}
                                                    transition={{ duration: 0.5 }}
                                                />
                                            </div>
                                            <div className="text-xs text-zinc-500 mt-1">
                                                {item.estimatedTimeRemaining} remaining
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="flex items-center gap-2 text-zinc-400 text-sm">
                                                <Clock className="w-4 h-4" />
                                                Waiting
                                            </div>
                                            <div className="text-xs text-zinc-500 mt-1">
                                                Est. {item.estimatedTimeRemaining}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    <button className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                                        <RotateCcw className="w-4 h-4 text-zinc-400" />
                                    </button>
                                    <button className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                                        <XCircle className="w-4 h-4 text-zinc-400" />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Recent Activity */}
            <div>
                <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
                <div className="space-y-2">
                    {recentMerges.map((item, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className={`p-3 rounded-lg border flex items-center gap-3 ${item.status === "merged"
                                    ? "bg-green-950/20 border-green-500/20"
                                    : "bg-red-950/20 border-red-500/20"
                                }`}
                        >
                            {item.status === "merged" ? (
                                <CheckCircle className="w-5 h-5 text-green-500" />
                            ) : (
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                            )}
                            <div className="flex-1">
                                <span className="text-white">
                                    #{item.pr.number} {item.pr.title}
                                </span>
                            </div>
                            {item.status === "merged" ? (
                                <span className="text-sm text-zinc-500">
                                    Merged {item.mergedAt} ({item.duration})
                                </span>
                            ) : (
                                <span className="text-sm text-red-400">
                                    Failed: {item.reason} ({item.attempts} attempts)
                                </span>
                            )}
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}

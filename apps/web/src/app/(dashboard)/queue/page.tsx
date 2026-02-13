"use client";

import { motion } from "framer-motion";
import {
    AlertTriangle,
    CheckCircle,
    Clock,
    GitMerge,
    GitPullRequest,
    Pause,
    Play,
    RotateCcw,
    XCircle,
    Zap,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    fetchQueue,
    pauseQueue,
    removeQueueItem,
    resumeQueue,
    retryQueueItem,
    setQueueTurbo,
} from "../../../lib/api";

export default function QueuePage() {
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery({
        queryKey: ["queue"],
        queryFn: fetchQueue,
        refetchInterval: 15_000,
    });

    const refreshQueue = async () => {
        await queryClient.invalidateQueries({ queryKey: ["queue"] });
    };

    const pauseMutation = useMutation({
        mutationFn: pauseQueue,
        onSuccess: refreshQueue,
    });

    const resumeMutation = useMutation({
        mutationFn: resumeQueue,
        onSuccess: refreshQueue,
    });

    const turboMutation = useMutation({
        mutationFn: setQueueTurbo,
        onSuccess: refreshQueue,
    });

    const retryMutation = useMutation({
        mutationFn: retryQueueItem,
        onSuccess: refreshQueue,
    });

    const removeMutation = useMutation({
        mutationFn: removeQueueItem,
        onSuccess: refreshQueue,
    });

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-nexus-500"></div>
            </div>
        );
    }

    if (error || !data) {
        const message = error instanceof Error ? error.message : "Queue data unavailable";
        return <div className="p-8 text-red-500">Error loading queue: {message}</div>;
    }

    const isHeaderActionPending =
        pauseMutation.isPending || resumeMutation.isPending || turboMutation.isPending;

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Merge Queue</h1>
                    <p className="text-zinc-400">
                        Automated, conflict-free merging with AI-powered CI optimization
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {data.controls.paused ? (
                        <button
                            onClick={() => resumeMutation.mutate()}
                            disabled={isHeaderActionPending}
                            className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            <Play className="w-4 h-4" />
                            Resume Queue
                        </button>
                    ) : (
                        <button
                            onClick={() => pauseMutation.mutate()}
                            disabled={isHeaderActionPending}
                            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            <Pause className="w-4 h-4" />
                            Pause Queue
                        </button>
                    )}
                    <button
                        onClick={() => turboMutation.mutate(!data.controls.turbo)}
                        disabled={isHeaderActionPending}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                            data.controls.turbo
                                ? "bg-yellow-600 hover:bg-yellow-500 text-white"
                                : "bg-nexus-600 hover:bg-nexus-500 text-white"
                        }`}
                    >
                        <Zap className="w-4 h-4" />
                        {data.controls.turbo ? "Disable Turbo" : "Enable Turbo"}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-zinc-400 text-sm">Queue Length</span>
                        <GitMerge className="w-4 h-4 text-nexus-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">{data.stats.queueLength}</div>
                    <div className="text-xs text-zinc-500">PRs waiting</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-zinc-400 text-sm">Avg Wait Time</span>
                        <Clock className="w-4 h-4 text-yellow-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">{data.stats.avgWaitTime}</div>
                    <div className="text-xs text-zinc-500">
                        {data.controls.turbo ? "Turbo mode active" : "Standard mode"}
                    </div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-zinc-400 text-sm">Success Rate</span>
                        <CheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">{data.stats.successRate}%</div>
                    <div className="text-xs text-zinc-500">Recent queue history</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-zinc-400 text-sm">Throughput</span>
                        <GitPullRequest className="w-4 h-4 text-purple-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">{data.stats.throughput}</div>
                    <div className="text-xs text-zinc-500">Merged PRs per day</div>
                </div>
            </div>

            <div className="mb-8">
                <h2 className="text-lg font-semibold text-white mb-4">Active Queue</h2>
                {data.active.length === 0 ? (
                    <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-400">
                        Queue is empty.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {data.active.map((item, index) => (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.06 }}
                                className={`p-4 rounded-xl border ${
                                    item.status === "running"
                                        ? "bg-nexus-950/30 border-nexus-500/30"
                                        : "bg-zinc-900/50 border-zinc-800"
                                }`}
                            >
                                <div className="flex items-center gap-4">
                                    <div
                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                            item.status === "running"
                                                ? "bg-nexus-500 text-white"
                                                : "bg-zinc-800 text-zinc-400"
                                        }`}
                                    >
                                        {item.position}
                                    </div>

                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-zinc-500 text-sm">{item.pr.repository}</span>
                                            <span className="text-zinc-600">|</span>
                                            <span className="text-zinc-500 text-sm">#{item.pr.number}</span>
                                            {item.priority === "high" && (
                                                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                                                    Priority
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-white font-medium">{item.pr.title}</h3>
                                        <div className="text-xs text-zinc-500 mt-1">
                                            by @{item.pr.author.username} | Added {item.addedAt}
                                        </div>
                                    </div>

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
                                                        animate={{ width: `${item.ciProgress ?? 0}%` }}
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

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => retryMutation.mutate(item.id)}
                                            disabled={retryMutation.isPending && retryMutation.variables === item.id}
                                            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                                            title="Retry"
                                        >
                                            <RotateCcw className="w-4 h-4 text-zinc-400" />
                                        </button>
                                        <button
                                            onClick={() => removeMutation.mutate(item.id)}
                                            disabled={removeMutation.isPending && removeMutation.variables === item.id}
                                            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                                            title="Remove"
                                        >
                                            <XCircle className="w-4 h-4 text-zinc-400" />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            <div>
                <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
                <div className="space-y-2">
                    {data.recent.map((item, index) => (
                        <motion.div
                            key={`${item.pr.number}-${index}`}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.07 }}
                            className={`p-3 rounded-lg border flex items-center gap-3 ${
                                item.status === "merged"
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
                                    Merged {item.mergedAt} {item.duration ? `(${item.duration})` : ""}
                                </span>
                            ) : (
                                <span className="text-sm text-red-400">
                                    Failed: {item.reason || "Unknown"} {item.attempts ? `(${item.attempts} attempts)` : ""}
                                </span>
                            )}
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}
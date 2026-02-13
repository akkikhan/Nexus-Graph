"use client";

import { motion } from "framer-motion";
import {
    AlertTriangle,
    BarChart3,
    Brain,
    Clock,
    TrendingUp,
    Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchInsightsDashboard, InsightsDashboard } from "../../../lib/api";

function toLabel(value: string): string {
    return value.replaceAll("_", " ");
}

function insightIcon(type: string) {
    if (type === "conflict_warning") return AlertTriangle;
    if (type === "fatigue_alert") return Users;
    if (type === "velocity_prediction") return TrendingUp;
    return Brain;
}

function insightTitle(type: string): string {
    if (type === "conflict_warning") return "Conflict Risk Detected";
    if (type === "fatigue_alert") return "Reviewer Fatigue Alert";
    if (type === "velocity_prediction") return "Sprint Completion Forecast";
    return "AI Insight";
}

function bottleneckHint(item: InsightsDashboard["bottlenecks"][number]): string {
    if (item.type === "review_wait") return "Distribute review load across more reviewers";
    if (item.type === "ci_time") return "Parallelize CI jobs and trim slow test suites";
    return "Review this bottleneck with the team";
}

function metricLabel(key: string): string {
    return key.replace(/([A-Z])/g, " $1").trim();
}

export default function InsightsPage() {
    const { data, isLoading, error } = useQuery({
        queryKey: ["insights", "dashboard"],
        queryFn: fetchInsightsDashboard,
        refetchInterval: 30_000,
    });

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-nexus-500"></div>
            </div>
        );
    }

    if (error || !data) {
        const errorMessage = error instanceof Error ? error.message : "Insights data unavailable";
        return (
            <div className="p-8 text-red-500">
                Error loading insights: {errorMessage}
            </div>
        );
    }

    const sprint = data.velocity.currentSprint;
    const sprintProgress = sprint.committed > 0 ? (sprint.completed / sprint.committed) * 100 : 0;
    const trendMax = Math.max(...data.velocity.trend.map((point) => point.velocity), 1);

    return (
        <div className="p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">AI Insights</h1>
                <p className="text-zinc-400">10X intelligence powering your development workflow</p>
            </div>

            <div className="mb-8">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-500" />
                    AI-Powered Insights
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {data.aiInsights.map((insight, i) => {
                        const Icon = insightIcon(insight.type);

                        return (
                            <motion.div
                                key={`${insight.type}-${i}`}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className={`p-4 rounded-xl border ${
                                    insight.severity === "high"
                                        ? "bg-red-950/30 border-red-500/30"
                                        : insight.severity === "warning"
                                            ? "bg-yellow-950/30 border-yellow-500/30"
                                            : insight.severity === "medium"
                                                ? "bg-orange-950/30 border-orange-500/30"
                                                : "bg-zinc-900/50 border-zinc-800"
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div
                                        className={`p-2 rounded-lg ${
                                            insight.severity === "high"
                                                ? "bg-red-500/20 text-red-400"
                                                : insight.severity === "warning"
                                                    ? "bg-yellow-500/20 text-yellow-400"
                                                    : insight.severity === "medium"
                                                        ? "bg-orange-500/20 text-orange-400"
                                                        : "bg-nexus-500/20 text-nexus-400"
                                        }`}
                                    >
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-medium text-white mb-1">{insightTitle(insight.type)}</h3>
                                        <p className="text-sm text-zinc-400 mb-3">{insight.message}</p>
                                        <span className="text-sm text-nexus-400 font-medium">
                                            {toLabel(insight.action)}
                                            {" ->"}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6"
                >
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-green-500" />
                        Sprint Velocity
                    </h2>

                    <div className="mb-6">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-zinc-400">Current Sprint Progress</span>
                            <span className="text-white">{sprint.completed}/{sprint.committed} pts</span>
                        </div>
                        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-nexus-500 to-purple-500"
                                style={{ width: `${Math.min(sprintProgress, 100)}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-zinc-500 mt-1">
                            <span>Predicted: {sprint.predicted} pts</span>
                            <span>{Math.round(sprint.accuracy * 100)}% accuracy</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                        {data.velocity.trend.map((point) => (
                            <div key={point.period} className="text-center">
                                <div className="h-20 flex items-end justify-center mb-1">
                                    <div
                                        className="w-8 bg-gradient-to-t from-nexus-600 to-nexus-400 rounded-t"
                                        style={{ height: `${(point.velocity / trendMax) * 100}%` }}
                                    />
                                </div>
                                <span className="text-xs text-zinc-500">{point.period}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6"
                >
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-nexus-500" />
                        Codebase Health
                    </h2>

                    <div className="flex items-center gap-4 mb-6">
                        <div className="relative w-20 h-20">
                            <svg className="w-full h-full -rotate-90">
                                <circle
                                    cx="40"
                                    cy="40"
                                    r="36"
                                    stroke="currentColor"
                                    strokeWidth="8"
                                    fill="none"
                                    className="text-zinc-800"
                                />
                                <circle
                                    cx="40"
                                    cy="40"
                                    r="36"
                                    stroke="url(#gradient)"
                                    strokeWidth="8"
                                    fill="none"
                                    strokeDasharray={`${data.codeHealth.score * 2.26} 226`}
                                    className="text-nexus-500"
                                />
                                <defs>
                                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#0ea5e9" />
                                        <stop offset="100%" stopColor="#8b5cf6" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-2xl font-bold text-white">{data.codeHealth.score}</span>
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center gap-1 text-green-500 text-sm">
                                <TrendingUp className="w-4 h-4" />
                                {data.codeHealth.trend} this week
                            </div>
                            <p className="text-sm text-zinc-400">Overall health score</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {Object.entries(data.codeHealth.breakdown).map(([key, value]) => (
                            <div key={key}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-zinc-400 capitalize">{metricLabel(key)}</span>
                                    <span className="text-white">{value}%</span>
                                </div>
                                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${
                                            value >= 70 ? "bg-green-500" : value >= 50 ? "bg-yellow-500" : "bg-red-500"
                                        }`}
                                        style={{ width: `${value}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6"
                >
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-500" />
                        Top Reviewers
                    </h2>
                    <div className="space-y-3">
                        {data.reviewerHealth.topReviewers.map((reviewer, i) => (
                            <div
                                key={reviewer.username}
                                className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg"
                            >
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-nexus-500 to-purple-600 flex items-center justify-center text-white font-bold">
                                    {i + 1}
                                </div>
                                <div className="flex-1">
                                    <span className="text-white font-medium">@{reviewer.username}</span>
                                    <div className="flex gap-3 text-xs text-zinc-500">
                                        <span>{reviewer.reviews} reviews</span>
                                        <span>{data.reviewerHealth.averageReviewTime} avg</span>
                                        <span className="text-green-500">{Math.round(reviewer.quality * 100)}% quality</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6"
                >
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-500" />
                        Bottlenecks Detected
                    </h2>
                    <div className="space-y-3">
                        {data.bottlenecks.map((bottleneck, i) => (
                            <div
                                key={`${bottleneck.type}-${i}`}
                                className="p-4 bg-yellow-950/20 border border-yellow-500/20 rounded-lg"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <Clock className="w-4 h-4 text-yellow-500" />
                                    <span className="text-white font-medium">{bottleneck.description}</span>
                                </div>
                                <p className="text-sm text-zinc-400">Tip: {bottleneckHint(bottleneck)}</p>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

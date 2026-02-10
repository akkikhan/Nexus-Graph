"use client";

import { motion } from "framer-motion";
import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    Clock,
    Users,
    GitPullRequest,
    AlertTriangle,
    CheckCircle,
    Brain,
    Zap,
} from "lucide-react";

// Mock data for team velocity and insights
const velocityData = {
    currentSprint: {
        committed: 24,
        completed: 16,
        predicted: 19,
        accuracy: 0.67,
    },
    weeklyTrend: [
        { week: "W1", prs: 12, avgReviewTime: 4.2 },
        { week: "W2", prs: 15, avgReviewTime: 3.8 },
        { week: "W3", prs: 18, avgReviewTime: 3.2 },
        { week: "W4", prs: 14, avgReviewTime: 4.5 },
    ],
    bottlenecks: [
        {
            type: "review_wait",
            avgHours: 18,
            description: "PRs wait 18h for initial review",
            suggestion: "Assign 2 additional reviewers",
        },
        {
            type: "ci_time",
            avgMinutes: 32,
            description: "CI pipeline takes 32min average",
            suggestion: "Parallelize test suites",
        },
    ],
    topReviewers: [
        { username: "sarah", reviews: 24, avgTime: 2.1, quality: 0.94 },
        { username: "mike", reviews: 18, avgTime: 3.5, quality: 0.89 },
        { username: "alex", reviews: 15, avgTime: 4.2, quality: 0.91 },
    ],
};

const codeHealthData = {
    overallScore: 78,
    trend: "+3",
    metrics: {
        testCoverage: 72,
        typeSafety: 85,
        documentation: 45,
        complexity: 68,
    },
    recentChanges: [
        { pr: "#234", impact: +4, description: "Added unit tests" },
        { pr: "#231", impact: -2, description: "Increased complexity" },
        { pr: "#228", impact: +1, description: "Fixed type errors" },
    ],
};

const aiInsights = [
    {
        type: "prediction",
        icon: Brain,
        title: "Sprint Completion Forecast",
        description: "Based on current velocity, you'll complete 19/24 story points (79%)",
        action: "View details",
        severity: "warning",
    },
    {
        type: "conflict",
        icon: AlertTriangle,
        title: "Conflict Risk Detected",
        description: "PR #245 may conflict with PR #242 - both modify auth/login.ts",
        action: "Coordinate merge",
        severity: "high",
    },
    {
        type: "fatigue",
        icon: Users,
        title: "Reviewer Fatigue Alert",
        description: "Sarah has reviewed 5 PRs in 2 hours - quality may be declining",
        action: "Reassign PRs",
        severity: "medium",
    },
    {
        type: "optimization",
        icon: Zap,
        title: "Test Generation Opportunity",
        description: "3 new functions in PR #248 have 0% test coverage",
        action: "Generate tests",
        severity: "low",
    },
];

export default function InsightsPage() {
    return (
        <div className="p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">AI Insights</h1>
                <p className="text-zinc-400">
                    10X intelligence powering your development workflow
                </p>
            </div>

            {/* AI Insights Panel */}
            <div className="mb-8">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-500" />
                    AI-Powered Insights
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aiInsights.map((insight, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className={`p-4 rounded-xl border ${insight.severity === "high"
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
                                    className={`p-2 rounded-lg ${insight.severity === "high"
                                            ? "bg-red-500/20 text-red-400"
                                            : insight.severity === "warning"
                                                ? "bg-yellow-500/20 text-yellow-400"
                                                : insight.severity === "medium"
                                                    ? "bg-orange-500/20 text-orange-400"
                                                    : "bg-nexus-500/20 text-nexus-400"
                                        }`}
                                >
                                    <insight.icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-medium text-white mb-1">{insight.title}</h3>
                                    <p className="text-sm text-zinc-400 mb-3">{insight.description}</p>
                                    <button className="text-sm text-nexus-400 hover:text-nexus-300 font-medium">
                                        {insight.action} →
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Team Velocity & Code Health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Team Velocity */}
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

                    {/* Sprint Progress */}
                    <div className="mb-6">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-zinc-400">Current Sprint Progress</span>
                            <span className="text-white">
                                {velocityData.currentSprint.completed}/
                                {velocityData.currentSprint.committed} pts
                            </span>
                        </div>
                        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-nexus-500 to-purple-500"
                                style={{
                                    width: `${(velocityData.currentSprint.completed / velocityData.currentSprint.committed) * 100}%`,
                                }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-zinc-500 mt-1">
                            <span>Predicted: {velocityData.currentSprint.predicted} pts</span>
                            <span>
                                {Math.round(velocityData.currentSprint.accuracy * 100)}% accuracy
                            </span>
                        </div>
                    </div>

                    {/* Weekly Trend */}
                    <div className="grid grid-cols-4 gap-2">
                        {velocityData.weeklyTrend.map((week) => (
                            <div key={week.week} className="text-center">
                                <div className="h-20 flex items-end justify-center mb-1">
                                    <div
                                        className="w-8 bg-gradient-to-t from-nexus-600 to-nexus-400 rounded-t"
                                        style={{ height: `${(week.prs / 20) * 100}%` }}
                                    />
                                </div>
                                <span className="text-xs text-zinc-500">{week.week}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Code Health */}
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

                    {/* Overall Score */}
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
                                    strokeDasharray={`${codeHealthData.overallScore * 2.26} 226`}
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
                                <span className="text-2xl font-bold text-white">
                                    {codeHealthData.overallScore}
                                </span>
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center gap-1 text-green-500 text-sm">
                                <TrendingUp className="w-4 h-4" />
                                {codeHealthData.trend} this week
                            </div>
                            <p className="text-sm text-zinc-400">Overall health score</p>
                        </div>
                    </div>

                    {/* Metrics */}
                    <div className="space-y-3">
                        {Object.entries(codeHealthData.metrics).map(([key, value]) => (
                            <div key={key}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-zinc-400 capitalize">
                                        {key.replace(/([A-Z])/g, " $1").trim()}
                                    </span>
                                    <span className="text-white">{value}%</span>
                                </div>
                                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${value >= 70
                                                ? "bg-green-500"
                                                : value >= 50
                                                    ? "bg-yellow-500"
                                                    : "bg-red-500"
                                            }`}
                                        style={{ width: `${value}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Top Reviewers & Bottlenecks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Reviewers */}
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
                        {velocityData.topReviewers.map((reviewer, i) => (
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
                                        <span>{reviewer.avgTime}h avg</span>
                                        <span className="text-green-500">
                                            {Math.round(reviewer.quality * 100)}% quality
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Bottlenecks */}
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
                        {velocityData.bottlenecks.map((bottleneck, i) => (
                            <div
                                key={i}
                                className="p-4 bg-yellow-950/20 border border-yellow-500/20 rounded-lg"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <Clock className="w-4 h-4 text-yellow-500" />
                                    <span className="text-white font-medium">
                                        {bottleneck.description}
                                    </span>
                                </div>
                                <p className="text-sm text-zinc-400 mb-2">
                                    💡 {bottleneck.suggestion}
                                </p>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

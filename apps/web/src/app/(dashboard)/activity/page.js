"use client";
import { motion } from "framer-motion";
import { GitPullRequest, GitMerge, MessageSquare, Bell, CheckCircle, XCircle, Bot, User, GitBranch, } from "lucide-react";
// Mock activity data
const activities = [
    {
        id: "act-1",
        type: "ai_review",
        icon: Bot,
        color: "text-purple-500",
        bgColor: "bg-purple-500/10",
        title: "AI Review Completed",
        description: 'Found 3 issues in "Add user authentication"',
        pr: { number: 234, title: "Add user authentication" },
        timestamp: "2 minutes ago",
        details: {
            critical: 0,
            warnings: 2,
            suggestions: 1,
        },
    },
    {
        id: "act-2",
        type: "pr_merged",
        icon: GitMerge,
        color: "text-green-500",
        bgColor: "bg-green-500/10",
        title: "PR Merged",
        description: "#231 merged to main",
        pr: { number: 231, title: "Fix payment race condition" },
        user: { username: "janedoe" },
        timestamp: "5 minutes ago",
    },
    {
        id: "act-3",
        type: "review_requested",
        icon: User,
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
        title: "Review Requested",
        description: "@johndoe requested your review",
        pr: { number: 234, title: "Add user authentication" },
        user: { username: "johndoe" },
        timestamp: "8 minutes ago",
    },
    {
        id: "act-4",
        type: "conflict_detected",
        icon: XCircle,
        color: "text-red-500",
        bgColor: "bg-red-500/10",
        title: "Conflict Predicted",
        description: "Potential conflict with #228",
        pr: { number: 234, title: "Add user authentication" },
        relatedPr: { number: 228, title: "Update dependencies" },
        timestamp: "12 minutes ago",
    },
    {
        id: "act-5",
        type: "stack_updated",
        icon: GitBranch,
        color: "text-nexus-500",
        bgColor: "bg-nexus-500/10",
        title: "Stack Synced",
        description: "auth-feature stack rebased successfully",
        stack: { name: "auth-feature", branches: 4 },
        user: { username: "you" },
        timestamp: "15 minutes ago",
    },
    {
        id: "act-6",
        type: "comment",
        icon: MessageSquare,
        color: "text-yellow-500",
        bgColor: "bg-yellow-500/10",
        title: "New Comment",
        description: '@mike: "Consider using early returns here"',
        pr: { number: 234, title: "Add user authentication" },
        user: { username: "mike" },
        timestamp: "18 minutes ago",
    },
    {
        id: "act-7",
        type: "ci_failed",
        icon: XCircle,
        color: "text-red-500",
        bgColor: "bg-red-500/10",
        title: "CI Failed",
        description: "Tests failed in payment module",
        pr: { number: 225, title: "Refactor API client" },
        timestamp: "22 minutes ago",
    },
    {
        id: "act-8",
        type: "pr_approved",
        icon: CheckCircle,
        color: "text-green-500",
        bgColor: "bg-green-500/10",
        title: "PR Approved",
        description: "@sarah approved your PR",
        pr: { number: 218, title: "Fix memory leak in worker" },
        user: { username: "sarah" },
        timestamp: "30 minutes ago",
    },
];
const filters = [
    { id: "all", label: "All Activity", count: 24 },
    { id: "reviews", label: "Reviews", count: 8 },
    { id: "merges", label: "Merges", count: 6 },
    { id: "ai", label: "AI Insights", count: 5 },
    { id: "mentions", label: "Mentions", count: 3 },
];
export default function ActivityPage() {
    return (<div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Activity</h1>
                    <p className="text-zinc-400">
                        Real-time updates from your repositories
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors">
                        <Bell className="w-4 h-4"/>
                        Mark All Read
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-6">
                {filters.map((filter, index) => (<button key={filter.id} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${index === 0
                ? "bg-nexus-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                        {filter.label}
                        <span className="ml-2 text-xs opacity-60">{filter.count}</span>
                    </button>))}
            </div>

            {/* Activity Feed */}
            <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[27px] top-0 bottom-0 w-px bg-zinc-800"/>

                <div className="space-y-4">
                    {activities.map((activity, index) => (<motion.div key={activity.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} className="relative flex gap-4">
                            {/* Icon */}
                            <div className={`relative z-10 w-14 h-14 rounded-xl ${activity.bgColor} flex items-center justify-center`}>
                                <activity.icon className={`w-6 h-6 ${activity.color}`}/>
                            </div>

                            {/* Content */}
                            <div className="flex-1 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-white font-medium">{activity.title}</h3>
                                        <p className="text-zinc-400 text-sm mt-1">
                                            {activity.description}
                                        </p>
                                    </div>
                                    <span className="text-xs text-zinc-500">
                                        {activity.timestamp}
                                    </span>
                                </div>

                                {/* Extra details based on type */}
                                {activity.type === "ai_review" && activity.details && (<div className="flex gap-3 mt-3">
                                        {activity.details.critical > 0 && (<span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
                                                {activity.details.critical} critical
                                            </span>)}
                                        {activity.details.warnings > 0 && (<span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                                                {activity.details.warnings} warnings
                                            </span>)}
                                        {activity.details.suggestions > 0 && (<span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                                                {activity.details.suggestions} suggestions
                                            </span>)}
                                    </div>)}

                                {activity.pr && (<div className="mt-3 flex items-center gap-2 text-sm">
                                        <GitPullRequest className="w-4 h-4 text-zinc-500"/>
                                        <span className="text-zinc-500">#{activity.pr.number}</span>
                                        <span className="text-zinc-400">{activity.pr.title}</span>
                                    </div>)}

                                {activity.relatedPr && (<div className="mt-2 flex items-center gap-2 text-sm">
                                        <span className="text-zinc-500">↔</span>
                                        <span className="text-zinc-500">
                                            #{activity.relatedPr.number}
                                        </span>
                                        <span className="text-zinc-400">
                                            {activity.relatedPr.title}
                                        </span>
                                    </div>)}
                            </div>
                        </motion.div>))}
                </div>
            </div>

            {/* Load More */}
            <div className="mt-8 text-center">
                <button className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium text-zinc-400 transition-colors">
                    Load More Activity
                </button>
            </div>
        </div>);
}
//# sourceMappingURL=page.js.map
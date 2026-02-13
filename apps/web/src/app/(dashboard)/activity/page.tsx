"use client";

import { motion } from "framer-motion";
import {
    Activity,
    GitPullRequest,
    GitMerge,
    MessageSquare,
    Bell,
    CheckCircle,
    XCircle,
    Clock,
    Bot,
    User,
    GitBranch,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchActivity, ActivityItem } from "../../../lib/api";
import { useMemo, useState } from "react";

const iconMap: Record<string, any> = {
    Bot,
    GitMerge,
    User,
    XCircle,
    GitBranch,
    MessageSquare,
    CheckCircle,
};

const FILTERS = [
    { id: "all", label: "All Activity" },
    { id: "reviews", label: "Reviews" },
    { id: "merges", label: "Merges" },
    { id: "stacks", label: "Stacks" },
] as const;

type ActivityFilter = (typeof FILTERS)[number]["id"];

function matchesFilter(activity: ActivityItem, filter: ActivityFilter): boolean {
    if (filter === "all") return true;
    if (filter === "reviews") {
        return activity.type === "ai_review" || activity.type === "review_requested";
    }
    if (filter === "merges") {
        return activity.type === "pr_merged";
    }
    if (filter === "stacks") {
        return activity.type === "stack_updated";
    }
    return true;
}

export default function ActivityPage() {
    const [activeFilter, setActiveFilter] = useState<ActivityFilter>("all");

    const { data: activities, isLoading, error } = useQuery({
        queryKey: ["activity"],
        queryFn: fetchActivity,
    });

    const allActivities = activities || [];
    const filterCounts = useMemo(() => {
        return FILTERS.reduce((acc, filter) => {
            acc[filter.id] = allActivities.filter((activity) =>
                matchesFilter(activity, filter.id)
            ).length;
            return acc;
        }, {} as Record<ActivityFilter, number>);
    }, [allActivities]);

    const activityList = useMemo(
        () => allActivities.filter((activity) => matchesFilter(activity, activeFilter)),
        [activeFilter, allActivities]
    );

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-nexus-500"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-red-500">
                Error loading activity: {(error as Error).message}
            </div>
        );
    }

    return (
        <div className="p-8">
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
                        <Bell className="w-4 h-4" />
                        Mark All Read
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-6">
                {FILTERS.map((filter) => (
                    <button
                        key={filter.id}
                        onClick={() => setActiveFilter(filter.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeFilter === filter.id
                            ? "bg-nexus-600 text-white"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            }`}
                    >
                        {filter.label} ({filterCounts[filter.id] || 0})
                    </button>
                ))}
            </div>

            {/* Activity Feed */}
            <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[27px] top-0 bottom-0 w-px bg-zinc-800" />

                <div className="space-y-4">
                    {activityList.length === 0 ? (
                        <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-400">
                            No {activeFilter} activity found.
                        </div>
                    ) : null}
                    {activityList.map((activity: ActivityItem, index: number) => {
                        const IconComponent = iconMap[activity.icon] || Activity;
                        return (
                            <motion.div
                                key={activity.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="relative flex gap-4"
                            >
                                {/* Icon */}
                                <div
                                    className={`relative z-10 w-14 h-14 rounded-xl ${activity.bgColor} flex items-center justify-center`}
                                >
                                    <IconComponent className={`w-6 h-6 ${activity.color}`} />
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
                                    {activity.type === "ai_review" && activity.details && (
                                        <div className="flex gap-3 mt-3">
                                            {activity.details.critical > 0 && (
                                                <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
                                                    {activity.details.critical} critical
                                                </span>
                                            )}
                                            {activity.details.warnings > 0 && (
                                                <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                                                    {activity.details.warnings} warnings
                                                </span>
                                            )}
                                            {activity.details.suggestions > 0 && (
                                                <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                                                    {activity.details.suggestions} suggestions
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {activity.pr && (
                                        <div className="mt-3 flex items-center gap-2 text-sm">
                                            <GitPullRequest className="w-4 h-4 text-zinc-500" />
                                            <span className="text-zinc-500">#{activity.pr.number}</span>
                                            <span className="text-zinc-400">{activity.pr.title}</span>
                                        </div>
                                    )}

                                    {activity.relatedPr && (
                                        <div className="mt-2 flex items-center gap-2 text-sm">
                                            <span className="text-zinc-500">↔</span>
                                            <span className="text-zinc-500">
                                                #{activity.relatedPr.number}
                                            </span>
                                            <span className="text-zinc-400">
                                                {activity.relatedPr.title}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Load More */}
            <div className="mt-8 text-center">
                <button className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium text-zinc-400 transition-colors">
                    Load More Activity
                </button>
            </div>
        </div>
    );
}

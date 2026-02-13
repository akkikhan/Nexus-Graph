"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, GitBranch, Send, RefreshCw } from "lucide-react";
import { fetchStackById, submitStack, syncStack } from "../../../../lib/api";

const statusBadge: Record<string, string> = {
    merged: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    approved: "bg-green-500/10 text-green-400 border-green-500/30",
    open: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    draft: "bg-zinc-600/20 text-zinc-300 border-zinc-600/40",
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    changes_requested: "bg-red-500/10 text-red-400 border-red-500/30",
    closed: "bg-zinc-700/20 text-zinc-400 border-zinc-700/40",
};

function statusText(status: string): string {
    return status.replaceAll("_", " ");
}

export default function StackDetailPage() {
    const params = useParams<{ id: string }>();
    const queryClient = useQueryClient();
    const [actionMessage, setActionMessage] = useState<string>("");

    const rawId = params?.id;
    const stackId = Array.isArray(rawId) ? rawId[0] || "" : rawId || "";

    const { data: stack, isLoading, error } = useQuery({
        queryKey: ["stack", stackId],
        queryFn: () => fetchStackById(stackId),
        enabled: Boolean(stackId),
    });

    const syncMutation = useMutation({
        mutationFn: () => syncStack(stackId),
        onSuccess: async (result) => {
            setActionMessage(result.message || "Stack sync started.");
            await queryClient.invalidateQueries({ queryKey: ["stack", stackId] });
            await queryClient.invalidateQueries({ queryKey: ["stacks"] });
        },
    });

    const submitMutation = useMutation({
        mutationFn: () => submitStack(stackId),
        onSuccess: async (result) => {
            setActionMessage(result.message || "Stack submitted.");
            await queryClient.invalidateQueries({ queryKey: ["stack", stackId] });
            await queryClient.invalidateQueries({ queryKey: ["stacks"] });
        },
    });

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-nexus-500"></div>
            </div>
        );
    }

    if (error || !stack) {
        const message = error instanceof Error ? error.message : "Stack not found";
        return <div className="p-8 text-red-500">Error loading stack: {message}</div>;
    }

    return (
        <div className="p-8 space-y-6">
            <div>
                <Link href="/stacks" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Stacks
                </Link>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6"
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-zinc-500 text-sm mb-2">{stack.repository.name}</div>
                        <h1 className="text-2xl font-bold text-white mb-2">{stack.name}</h1>
                        <p className="text-zinc-400 text-sm max-w-3xl">
                            {stack.description || "Stack details and branch dependency order."}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-white">{stack.branches.length}</div>
                        <div className="text-xs text-zinc-500 uppercase">Branches</div>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-400">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-700">
                        <GitBranch className="w-3 h-3" />
                        Base {stack.baseBranch}
                    </span>
                    <span className="px-2 py-1 rounded border border-zinc-700">
                        {stack.mergableCount} mergeable
                    </span>
                    <span className="px-2 py-1 rounded border border-zinc-700">
                        {stack.totalPRs} PRs
                    </span>
                </div>

                <div className="mt-5 flex gap-3">
                    <button
                        onClick={() => syncMutation.mutate()}
                        disabled={syncMutation.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm disabled:opacity-50"
                    >
                        <RefreshCw className="w-4 h-4" />
                        {syncMutation.isPending ? "Syncing..." : "Sync Stack"}
                    </button>
                    <button
                        onClick={() => submitMutation.mutate()}
                        disabled={submitMutation.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-nexus-600 hover:bg-nexus-500 rounded-lg text-sm disabled:opacity-50"
                    >
                        <Send className="w-4 h-4" />
                        {submitMutation.isPending ? "Submitting..." : "Submit Stack"}
                    </button>
                </div>

                {actionMessage ? <div className="mt-3 text-sm text-green-400">{actionMessage}</div> : null}
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6"
            >
                <h2 className="text-white font-semibold mb-4">Branch Order</h2>
                <div className="space-y-3">
                    {stack.branches.map((branch, index) => (
                        <div
                            key={`${branch.name}-${index}`}
                            className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
                        >
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="text-sm text-zinc-300 font-mono">{branch.name}</div>
                                <span className={`px-2 py-0.5 text-xs rounded-full border ${statusBadge[branch.status] || statusBadge.pending}`}>
                                    {statusText(branch.status)}
                                </span>
                            </div>

                            {branch.pr ? (
                                <div className="text-xs text-zinc-500">
                                    #{branch.pr.number} {branch.pr.title}
                                    {typeof branch.pr.riskScore === "number" ? ` | risk ${Math.round(branch.pr.riskScore)}` : ""}
                                </div>
                            ) : (
                                <div className="text-xs text-zinc-600">No PR linked</div>
                            )}
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}

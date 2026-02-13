"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, GitBranch, GitPullRequest, Sparkles, CheckCircle2 } from "lucide-react";
import { fetchPRById, mergePR, requestPRReview } from "../../../../lib/api";

const riskClasses: Record<string, string> = {
    low: "text-risk-low",
    medium: "text-risk-medium",
    high: "text-risk-high",
    critical: "text-risk-critical",
};

export default function PRDetailPage() {
    const params = useParams<{ id: string }>();
    const queryClient = useQueryClient();
    const [actionMessage, setActionMessage] = useState<string>("");

    const rawId = params?.id;
    const prId = Array.isArray(rawId) ? rawId[0] || "" : rawId || "";

    const { data: pr, isLoading, error } = useQuery({
        queryKey: ["pr", prId],
        queryFn: () => fetchPRById(prId),
        enabled: Boolean(prId),
    });

    const mergeMutation = useMutation({
        mutationFn: () => mergePR(prId),
        onSuccess: async () => {
            setActionMessage("PR merged successfully.");
            await queryClient.invalidateQueries({ queryKey: ["pr", prId] });
            await queryClient.invalidateQueries({ queryKey: ["prs"] });
        },
    });

    const aiReviewMutation = useMutation({
        mutationFn: () => requestPRReview(prId),
        onSuccess: () => {
            setActionMessage("AI review queued.");
        },
    });

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-nexus-500"></div>
            </div>
        );
    }

    if (error || !pr) {
        const message = error instanceof Error ? error.message : "PR not found";
        return <div className="p-8 text-red-500">Error loading PR: {message}</div>;
    }

    const files = pr.files || [];

    return (
        <div className="p-8 space-y-6">
            <div>
                <Link href="/inbox" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Inbox
                </Link>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6"
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-zinc-500 text-sm mb-2">
                            {pr.repository.name} | #{pr.number}
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">{pr.title}</h1>
                        <p className="text-zinc-400 text-sm max-w-3xl">
                            {pr.description || pr.aiSummary || "No description available."}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className={`text-3xl font-bold ${riskClasses[pr.riskLevel] || "text-zinc-300"}`}>
                            {pr.riskScore}
                        </div>
                        <div className="text-xs text-zinc-500 uppercase">Risk</div>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-400">
                    <span className="px-2 py-1 rounded border border-zinc-700">status: {pr.status}</span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-700">
                        <GitBranch className="w-3 h-3" />
                        {pr.headBranch || "feature"}
                        {" -> "}
                        {pr.baseBranch || "main"}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-700">
                        <GitPullRequest className="w-3 h-3" />
                        by @{pr.author.username}
                    </span>
                </div>

                <div className="mt-5 flex gap-3">
                    <button
                        onClick={() => aiReviewMutation.mutate()}
                        disabled={aiReviewMutation.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm disabled:opacity-50"
                    >
                        <Sparkles className="w-4 h-4" />
                        {aiReviewMutation.isPending ? "Queuing..." : "Request AI Review"}
                    </button>
                    <button
                        onClick={() => mergeMutation.mutate()}
                        disabled={mergeMutation.isPending || pr.status === "merged"}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-nexus-600 hover:bg-nexus-500 rounded-lg text-sm disabled:opacity-50"
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        {mergeMutation.isPending ? "Merging..." : pr.status === "merged" ? "Merged" : "Merge PR"}
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
                <h2 className="text-white font-semibold mb-4">Changed Files</h2>
                {files.length === 0 ? (
                    <div className="text-zinc-500 text-sm">No file changes available.</div>
                ) : (
                    <div className="space-y-2">
                        {files.map((file) => (
                            <div
                                key={file.path}
                                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2"
                            >
                                <span className="text-zinc-300 text-sm font-mono">{file.path}</span>
                                <div className="text-xs flex gap-2">
                                    <span className="text-green-400">+{file.additions}</span>
                                    <span className="text-red-400">-{file.deletions}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>
        </div>
    );
}

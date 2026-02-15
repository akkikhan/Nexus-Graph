"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    createAiRule,
    deleteAiRule,
    fetchAiRules,
    setAiRuleEnabled,
} from "../../../lib/api";

function splitPatterns(input: string): string[] {
    return input
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
}

export default function AiRulesPage() {
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [prompt, setPrompt] = useState("");
    const [regexPattern, setRegexPattern] = useState("");
    const [filePatterns, setFilePatterns] = useState("");
    const [severity, setSeverity] = useState<"info" | "warning" | "high" | "critical">("warning");

    const { data, isLoading, error } = useQuery({
        queryKey: ["ai-rules"],
        queryFn: fetchAiRules,
        refetchInterval: 30_000,
    });

    const rules = useMemo(() => data ?? [], [data]);

    const refresh = async () => {
        await queryClient.invalidateQueries({ queryKey: ["ai-rules"] });
    };

    const createMutation = useMutation({
        mutationFn: createAiRule,
        onSuccess: async () => {
            setName("");
            setPrompt("");
            setRegexPattern("");
            setFilePatterns("");
            setSeverity("warning");
            await refresh();
        },
    });

    const toggleMutation = useMutation({
        mutationFn: setAiRuleEnabled,
        onSuccess: refresh,
    });

    const deleteMutation = useMutation({
        mutationFn: deleteAiRule,
        onSuccess: refresh,
    });

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
                        <Bot className="w-7 h-7 text-purple-500" />
                        AI Rules
                    </h1>
                    <p className="text-zinc-400">
                        Define patterns that auto-flag pull requests and influence risk scoring.
                    </p>
                </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 mb-8">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-nexus-400" />
                    Create Rule
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm text-zinc-400">Name</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Auth changes require extra review"
                            className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-600"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-zinc-400">Severity</label>
                        <select
                            value={severity}
                            onChange={(e) => setSeverity(e.target.value as any)}
                            className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white"
                        >
                            <option value="info">info</option>
                            <option value="warning">warning</option>
                            <option value="high">high</option>
                            <option value="critical">critical</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-sm text-zinc-400">Regex Pattern (optional)</label>
                        <input
                            value={regexPattern}
                            onChange={(e) => setRegexPattern(e.target.value)}
                            placeholder="e.g. (?i)\\b(auth|oauth|jwt)\\b"
                            className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-600"
                        />
                        <p className="mt-1 text-xs text-zinc-500">
                            Tested against PR title + file paths.
                        </p>
                    </div>

                    <div>
                        <label className="text-sm text-zinc-400">File Patterns (optional)</label>
                        <input
                            value={filePatterns}
                            onChange={(e) => setFilePatterns(e.target.value)}
                            placeholder="e.g. auth/*, **/*.sql, migrations/*"
                            className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-600"
                        />
                        <p className="mt-1 text-xs text-zinc-500">
                            Comma-separated. Supports simple wildcards like <code>*</code>.
                        </p>
                    </div>

                    <div className="md:col-span-2">
                        <label className="text-sm text-zinc-400">Prompt</label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Explain what the reviewer should check, and what risks to look for."
                            rows={4}
                            className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-600"
                        />
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-end">
                    <button
                        onClick={() =>
                            createMutation.mutate({
                                name,
                                prompt,
                                regexPattern: regexPattern.trim() || undefined,
                                filePatterns: splitPatterns(filePatterns),
                                severity,
                            })
                        }
                        disabled={!name.trim() || !prompt.trim() || createMutation.isPending}
                        className="px-4 py-2 rounded-lg bg-nexus-600 hover:bg-nexus-500 text-white text-sm font-medium disabled:opacity-50"
                    >
                        {createMutation.isPending ? "Creating..." : "Create Rule"}
                    </button>
                </div>

                {createMutation.error instanceof Error ? (
                    <div className="mt-3 text-sm text-red-400">
                        {createMutation.error.message}
                    </div>
                ) : null}
            </div>

            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Rules</h2>
                <div className="text-sm text-zinc-500">{rules.length} total</div>
            </div>

            {isLoading ? (
                <div className="p-8 flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-nexus-500"></div>
                </div>
            ) : error || !data ? (
                <div className="text-red-500">
                    Error loading AI rules:{" "}
                    {error instanceof Error ? error.message : "Unknown error"}
                </div>
            ) : rules.length === 0 ? (
                <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-400">
                    No AI rules yet. Create one above.
                </div>
            ) : (
                <div className="space-y-3">
                    {rules.map((rule, idx) => (
                        <motion.div
                            key={rule.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.04 }}
                            className="p-4 rounded-xl border bg-zinc-900/50 border-zinc-800"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-white font-medium truncate">{rule.name}</h3>
                                        <span
                                            className={`text-xs px-2 py-0.5 rounded-full border ${
                                                rule.severity === "critical"
                                                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                                                    : rule.severity === "high"
                                                        ? "bg-orange-500/10 border-orange-500/30 text-orange-300"
                                                        : rule.severity === "warning"
                                                            ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"
                                                            : "bg-zinc-800/40 border-zinc-700 text-zinc-300"
                                            }`}
                                        >
                                            {rule.severity}
                                        </span>
                                        <span className="text-xs text-zinc-500">
                                            {rule.enabled ? "enabled" : "disabled"}
                                        </span>
                                    </div>
                                    <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{rule.prompt}</p>
                                    <div className="mt-2 text-xs text-zinc-500 space-x-2">
                                        {rule.regexPattern ? (
                                            <span>
                                                regex: <code className="text-zinc-300">{rule.regexPattern}</code>
                                            </span>
                                        ) : null}
                                        {rule.filePatterns?.length ? (
                                            <span>
                                                files:{" "}
                                                <code className="text-zinc-300">
                                                    {rule.filePatterns.join(", ")}
                                                </code>
                                            </span>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() =>
                                            toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })
                                        }
                                        disabled={toggleMutation.isPending}
                                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm disabled:opacity-50 flex items-center gap-2"
                                        title="Toggle enabled"
                                    >
                                        {rule.enabled ? (
                                            <ToggleRight className="w-4 h-4 text-green-400" />
                                        ) : (
                                            <ToggleLeft className="w-4 h-4 text-zinc-400" />
                                        )}
                                        {rule.enabled ? "On" : "Off"}
                                    </button>

                                    <button
                                        onClick={() => deleteMutation.mutate(rule.id)}
                                        disabled={deleteMutation.isPending}
                                        className="px-3 py-2 rounded-lg bg-red-950/40 hover:bg-red-900/40 border border-red-900/30 text-red-200 text-sm disabled:opacity-50 flex items-center gap-2"
                                        title="Delete rule"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}


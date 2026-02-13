"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { GitBranch, Plus, MoreHorizontal, ChevronRight, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createStack, fetchStacks, StackBranch, StackItem } from "../../../lib/api";
import { useRouter } from "next/navigation";

const statusColors: Record<string, string> = {
    merged: "bg-purple-500",
    approved: "bg-green-500",
    open: "bg-blue-500",
    draft: "bg-zinc-500",
    pending: "bg-yellow-500",
    changes_requested: "bg-red-500",
    closed: "bg-zinc-600",
};

function statusText(status: string): string {
    return status.replaceAll("_", " ");
}

export default function StacksPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [localCreatedStacks, setLocalCreatedStacks] = useState<StackItem[]>([]);
    const [form, setForm] = useState({
        name: "",
        repositoryId: "local/repository",
        baseBranch: "main",
    });
    const [formMessage, setFormMessage] = useState("");

    const { data: stacks, isLoading, error } = useQuery({
        queryKey: ["stacks"],
        queryFn: fetchStacks,
    });

    const createMutation = useMutation({
        mutationFn: () =>
            createStack({
                name: form.name.trim(),
                repositoryId: form.repositoryId.trim(),
                baseBranch: form.baseBranch.trim() || "main",
            }),
        onSuccess: async (result) => {
            const createdId = result?.stack?.id;
            if (createdId && createdId.startsWith("stack-")) {
                const localItem: StackItem = {
                    id: createdId,
                    name: result.stack.name || form.name.trim(),
                    repository: {
                        id: form.repositoryId.trim(),
                        name: form.repositoryId.trim(),
                    },
                    baseBranch: result.stack.baseBranch || form.baseBranch.trim() || "main",
                    branches: [],
                    mergableCount: 0,
                    totalPRs: 0,
                    createdAt: result.stack.createdAt || new Date().toISOString(),
                    updatedAt: result.stack.createdAt || new Date().toISOString(),
                };
                setLocalCreatedStacks((prev) => [localItem, ...prev]);
                setFormMessage("Stack created in local/mock mode.");
            } else {
                setFormMessage("Stack created.");
            }
            setShowCreateForm(false);
            setForm({ name: "", repositoryId: "local/repository", baseBranch: "main" });
            await queryClient.invalidateQueries({ queryKey: ["stacks"] });
            if (createdId && !createdId.startsWith("stack-")) {
                router.push(`/stacks/${createdId}`);
            }
        },
        onError: (mutationError) => {
            const message = mutationError instanceof Error ? mutationError.message : "Failed to create stack";
            setFormMessage(message);
        },
    });

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
                Error loading stacks: {(error as Error).message}
            </div>
        );
    }

    const fetchedStacks = (stacks || []) as StackItem[];
    const mergedStackMap = new Map<string, StackItem>();
    for (const stack of localCreatedStacks) mergedStackMap.set(stack.id, stack);
    for (const stack of fetchedStacks) mergedStackMap.set(stack.id, stack);
    const stackList = Array.from(mergedStackMap.values());

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Stacks</h1>
                    <p className="text-zinc-400">Manage your stacked pull requests visually</p>
                </div>
                <button
                    onClick={() => {
                        setShowCreateForm((prev) => !prev);
                        setFormMessage("");
                    }}
                    data-testid="new-stack-button"
                    className="flex items-center gap-2 px-4 py-2.5 bg-nexus-600 hover:bg-nexus-500 text-white rounded-lg font-medium transition-colors"
                >
                    {showCreateForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {showCreateForm ? "Cancel" : "New Stack"}
                </button>
            </div>

            {showCreateForm ? (
                <motion.form
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    data-testid="create-stack-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!form.name.trim()) {
                            setFormMessage("Stack name is required.");
                            return;
                        }
                        if (!form.repositoryId.trim()) {
                            setFormMessage("Repository ID is required.");
                            return;
                        }
                        setFormMessage("");
                        createMutation.mutate();
                    }}
                    className="mb-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl"
                >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                            value={form.name}
                            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                            placeholder="Stack name"
                            data-testid="stack-name-input"
                            className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600"
                        />
                        <input
                            value={form.repositoryId}
                            onChange={(event) => setForm((prev) => ({ ...prev, repositoryId: event.target.value }))}
                            placeholder="Repository ID"
                            data-testid="stack-repo-input"
                            className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600"
                        />
                        <input
                            value={form.baseBranch}
                            onChange={(event) => setForm((prev) => ({ ...prev, baseBranch: event.target.value }))}
                            placeholder="Base branch"
                            data-testid="stack-base-input"
                            className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600"
                        />
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                        <span className={`text-sm ${formMessage.toLowerCase().includes("failed") || formMessage.toLowerCase().includes("required") ? "text-red-400" : "text-zinc-500"}`}>
                            {formMessage}
                        </span>
                        <button
                            type="submit"
                            disabled={createMutation.isPending}
                            data-testid="create-stack-submit"
                            className="px-4 py-2 bg-nexus-600 hover:bg-nexus-500 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        >
                            {createMutation.isPending ? "Creating..." : "Create Stack"}
                        </button>
                    </div>
                </motion.form>
            ) : null}

            {!showCreateForm && formMessage ? (
                <div className="mb-4 text-sm text-green-400">{formMessage}</div>
            ) : null}

            {stackList.length === 0 ? (
                <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-400">
                    No stacks found yet. Create one with the form above or CLI (`nx create`, `nx submit`).
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {stackList.map((stack, i) => (
                        <motion.div
                            key={stack.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden"
                            data-testid={`stack-card-${stack.id}`}
                            onClick={() => {
                                const isLocalMockStack = localCreatedStacks.some(
                                    (localStack) => localStack.id === stack.id
                                );
                                if (isLocalMockStack) {
                                    setFormMessage(
                                        "This stack was created in mock mode. Connect DB to open persistent details."
                                    );
                                    return;
                                }
                                router.push(`/stacks/${stack.id}`);
                            }}
                        >
                            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-nexus-500/20 to-purple-500/20 flex items-center justify-center">
                                        <GitBranch className="w-5 h-5 text-nexus-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-white">{stack.name}</h3>
                                        <p className="text-xs text-zinc-500">
                                            {stack.branches.length} branches | Base {stack.baseBranch}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={(event) => event.stopPropagation()}
                                    className="p-2 text-zinc-500 hover:text-white transition-colors"
                                >
                                    <MoreHorizontal className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-4">
                                <div className="space-y-2">
                                    {stack.branches.map((branch: StackBranch, j: number) => (
                                        <div
                                            key={branch.name}
                                            className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors cursor-pointer group"
                                        >
                                            <div className="flex flex-col items-center w-6">
                                                {j > 0 && <div className="w-0.5 h-2 bg-zinc-700 -mt-4" />}
                                                <div className={`w-3 h-3 rounded-full ${statusColors[branch.status] || "bg-zinc-600"}`} />
                                                {j < stack.branches.length - 1 && <div className="w-0.5 h-2 bg-zinc-700" />}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-white truncate">{branch.name}</span>
                                                    {branch.prNumber && <span className="text-xs text-zinc-500">#{branch.prNumber}</span>}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-zinc-500">
                                                    <span className="capitalize">{statusText(branch.status)}</span>
                                                </div>
                                            </div>

                                            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center gap-3 text-zinc-500">
                                    <div className="w-6 flex justify-center">
                                        <div className="w-2 h-2 rounded-full bg-zinc-600" />
                                    </div>
                                    <span className="text-sm">{stack.baseBranch}</span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}

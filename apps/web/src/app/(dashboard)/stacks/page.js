"use client";
import { motion } from "framer-motion";
import { GitBranch, Plus, MoreHorizontal, ChevronRight } from "lucide-react";
// Mock stacks data
const mockStacks = [
    {
        id: 1,
        name: "User Authentication Flow",
        branches: [
            {
                name: "auth/db-schema",
                status: "merged",
                pr: 123,
                lines: { added: 145, removed: 12 },
            },
            {
                name: "auth/api-endpoints",
                status: "approved",
                pr: 124,
                lines: { added: 234, removed: 45 },
            },
            {
                name: "auth/frontend-ui",
                status: "open",
                pr: 125,
                lines: { added: 567, removed: 23 },
            },
            {
                name: "auth/tests",
                status: "draft",
                pr: null,
                lines: { added: 189, removed: 0 },
            },
        ],
        updatedAt: "10 minutes ago",
    },
    {
        id: 2,
        name: "Payment Integration",
        branches: [
            {
                name: "payments/stripe-setup",
                status: "merged",
                pr: 118,
                lines: { added: 89, removed: 5 },
            },
            {
                name: "payments/checkout-flow",
                status: "open",
                pr: 119,
                lines: { added: 456, removed: 78 },
            },
        ],
        updatedAt: "2 hours ago",
    },
];
const statusColors = {
    merged: "bg-purple-500",
    approved: "bg-green-500",
    open: "bg-blue-500",
    draft: "bg-zinc-500",
    changes_requested: "bg-red-500",
};
export default function StacksPage() {
    return (<div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Stacks</h1>
                    <p className="text-zinc-400">
                        Manage your stacked pull requests visually
                    </p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-nexus-600 hover:bg-nexus-500 text-white rounded-lg font-medium transition-colors">
                    <Plus className="w-4 h-4"/>
                    New Stack
                </button>
            </div>

            {/* Stacks Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {mockStacks.map((stack, i) => (<motion.div key={stack.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                        {/* Stack Header */}
                        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-nexus-500/20 to-purple-500/20 flex items-center justify-center">
                                    <GitBranch className="w-5 h-5 text-nexus-400"/>
                                </div>
                                <div>
                                    <h3 className="font-medium text-white">{stack.name}</h3>
                                    <p className="text-xs text-zinc-500">
                                        {stack.branches.length} branches • Updated {stack.updatedAt}
                                    </p>
                                </div>
                            </div>
                            <button className="p-2 text-zinc-500 hover:text-white transition-colors">
                                <MoreHorizontal className="w-5 h-5"/>
                            </button>
                        </div>

                        {/* Stack Visualization */}
                        <div className="p-4">
                            <div className="space-y-2">
                                {stack.branches.map((branch, j) => (<div key={branch.name} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors cursor-pointer group">
                                        {/* Connection line */}
                                        <div className="flex flex-col items-center w-6">
                                            {j > 0 && (<div className="w-0.5 h-2 bg-zinc-700 -mt-4"/>)}
                                            <div className={`w-3 h-3 rounded-full ${statusColors[branch.status]}`}/>
                                            {j < stack.branches.length - 1 && (<div className="w-0.5 h-2 bg-zinc-700"/>)}
                                        </div>

                                        {/* Branch info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-white truncate">
                                                    {branch.name}
                                                </span>
                                                {branch.pr && (<span className="text-xs text-zinc-500">
                                                        #{branch.pr}
                                                    </span>)}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                                                <span className="text-green-500">
                                                    +{branch.lines.added}
                                                </span>
                                                <span className="text-red-500">
                                                    -{branch.lines.removed}
                                                </span>
                                                <span className="capitalize">{branch.status}</span>
                                            </div>
                                        </div>

                                        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors"/>
                                    </div>))}
                            </div>

                            {/* Trunk indicator */}
                            <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center gap-3 text-zinc-500">
                                <div className="w-6 flex justify-center">
                                    <div className="w-2 h-2 rounded-full bg-zinc-600"/>
                                </div>
                                <span className="text-sm">main</span>
                            </div>
                        </div>
                    </motion.div>))}
            </div>
        </div>);
}
//# sourceMappingURL=page.js.map
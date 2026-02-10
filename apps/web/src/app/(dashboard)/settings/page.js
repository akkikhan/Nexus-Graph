"use client";
import { motion } from "framer-motion";
import { Bot, Bell, GitBranch, Globe, ChevronRight, } from "lucide-react";
// Settings sections
const sections = [
    {
        id: "ai",
        title: "AI Configuration",
        icon: Bot,
        description: "Configure AI models and review settings",
        settings: [
            {
                key: "ai_provider",
                label: "AI Provider",
                type: "select",
                value: "anthropic",
                options: ["anthropic", "openai", "google"],
                description: "Primary AI provider for code reviews",
            },
            {
                key: "ai_model",
                label: "AI Model",
                type: "select",
                value: "claude-sonnet-4-20250514",
                options: ["claude-sonnet-4-20250514", "gpt-4o", "gemini-1.5-pro"],
                description: "Model used for analysis",
            },
            {
                key: "ensemble_mode",
                label: "Ensemble Debate Mode",
                type: "toggle",
                value: true,
                description: "Use multiple models for critical reviews",
            },
            {
                key: "auto_review",
                label: "Auto Review on PR",
                type: "toggle",
                value: true,
                description: "Automatically review new PRs",
            },
            {
                key: "risk_threshold",
                label: "Risk Alert Threshold",
                type: "slider",
                value: 70,
                min: 0,
                max: 100,
                description: "Alert when risk score exceeds this value",
            },
        ],
    },
    {
        id: "merge_queue",
        title: "Merge Queue",
        icon: GitBranch,
        description: "Configure merge queue behavior",
        settings: [
            {
                key: "merge_queue_enabled",
                label: "Enable Merge Queue",
                type: "toggle",
                value: true,
                description: "Use automated merge queue",
            },
            {
                key: "require_ci",
                label: "Require CI Pass",
                type: "toggle",
                value: true,
                description: "PRs must pass CI before merging",
            },
            {
                key: "auto_rebase",
                label: "Auto Rebase",
                type: "toggle",
                value: true,
                description: "Automatically rebase on conflicts",
            },
            {
                key: "merge_method",
                label: "Merge Method",
                type: "select",
                value: "squash",
                options: ["merge", "squash", "rebase"],
                description: "How to merge PRs",
            },
        ],
    },
    {
        id: "notifications",
        title: "Notifications",
        icon: Bell,
        description: "Configure notification preferences",
        settings: [
            {
                key: "email_reviews",
                label: "Email for Reviews",
                type: "toggle",
                value: true,
                description: "Receive email for review requests",
            },
            {
                key: "email_ai_findings",
                label: "Email for AI Findings",
                type: "toggle",
                value: false,
                description: "Receive email for high-risk AI findings",
            },
            {
                key: "slack_enabled",
                label: "Slack Integration",
                type: "toggle",
                value: false,
                description: "Send notifications to Slack",
            },
            {
                key: "desktop_notifications",
                label: "Desktop Notifications",
                type: "toggle",
                value: true,
                description: "Browser push notifications",
            },
        ],
    },
    {
        id: "integrations",
        title: "Integrations",
        icon: Globe,
        description: "Connect external services",
        links: [
            { label: "GitHub", status: "connected", icon: "🔗" },
            { label: "GitLab", status: "disconnected", icon: "○" },
            { label: "Slack", status: "disconnected", icon: "○" },
            { label: "Jira", status: "disconnected", icon: "○" },
            { label: "Linear", status: "coming_soon", icon: "🔜" },
        ],
    },
];
export default function SettingsPage() {
    return (<div className="p-8 max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
                <p className="text-zinc-400">
                    Configure NEXUS to fit your workflow
                </p>
            </div>

            {/* Settings Sections */}
            <div className="space-y-8">
                {sections.map((section, sectionIndex) => (<motion.div key={section.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: sectionIndex * 0.1 }} className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                        {/* Section Header */}
                        <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
                            <div className="p-2 bg-nexus-500/20 rounded-lg">
                                <section.icon className="w-5 h-5 text-nexus-400"/>
                            </div>
                            <div>
                                <h2 className="font-semibold text-white">{section.title}</h2>
                                <p className="text-sm text-zinc-500">{section.description}</p>
                            </div>
                        </div>

                        {/* Settings */}
                        {section.settings && (<div className="divide-y divide-zinc-800">
                                {section.settings.map((setting) => (<div key={setting.key} className="p-4 flex items-center justify-between">
                                        <div>
                                            <label className="text-white font-medium">
                                                {setting.label}
                                            </label>
                                            <p className="text-sm text-zinc-500">
                                                {setting.description}
                                            </p>
                                        </div>

                                        {setting.type === "toggle" && (<button className={`relative w-12 h-6 rounded-full transition-colors ${setting.value ? "bg-nexus-500" : "bg-zinc-700"}`}>
                                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${setting.value ? "right-1" : "left-1"}`}/>
                                            </button>)}

                                        {setting.type === "select" && (<select value={setting.value} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-nexus-500">
                                                {setting.options?.map((opt) => (<option key={opt} value={opt}>
                                                        {opt}
                                                    </option>))}
                                            </select>)}

                                        {setting.type === "slider" && (<div className="flex items-center gap-3">
                                                <input type="range" min={setting.min} max={setting.max} value={setting.value} className="w-32 accent-nexus-500"/>
                                                <span className="text-white text-sm w-8">
                                                    {setting.value}
                                                </span>
                                            </div>)}
                                    </div>))}
                            </div>)}

                        {/* Integration Links */}
                        {section.links && (<div className="divide-y divide-zinc-800">
                                {section.links.map((link) => (<div key={link.label} className="p-4 flex items-center justify-between hover:bg-zinc-800/50 cursor-pointer transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">{link.icon}</span>
                                            <span className="text-white font-medium">{link.label}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm ${link.status === "connected"
                        ? "text-green-400"
                        : link.status === "coming_soon"
                            ? "text-zinc-500"
                            : "text-zinc-400"}`}>
                                                {link.status === "connected"
                        ? "Connected"
                        : link.status === "coming_soon"
                            ? "Coming Soon"
                            : "Connect"}
                                            </span>
                                            <ChevronRight className="w-4 h-4 text-zinc-500"/>
                                        </div>
                                    </div>))}
                            </div>)}
                    </motion.div>))}
            </div>

            {/* Danger Zone */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-8 p-6 bg-red-950/20 border border-red-500/30 rounded-xl">
                <h2 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h2>
                <p className="text-sm text-zinc-400 mb-4">
                    These actions are destructive and cannot be undone.
                </p>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium text-zinc-300 transition-colors">
                        Reset AI Training
                    </button>
                    <button className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 rounded-lg text-sm font-medium text-red-400 transition-colors">
                        Delete Organization
                    </button>
                </div>
            </motion.div>

            {/* Save Button */}
            <div className="mt-8 flex justify-end">
                <button className="px-6 py-2 bg-nexus-600 hover:bg-nexus-500 rounded-lg font-medium transition-colors">
                    Save Changes
                </button>
            </div>
        </div>);
}
//# sourceMappingURL=page.js.map
"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Bot, ShieldCheck, Gauge, Sparkles } from "lucide-react";

type SettingValue = string | number | boolean;
type SettingsValues = Record<string, SettingValue>;

const SETTINGS_STORAGE_KEY = "nexus.settings.v1";
const defaultValues: SettingsValues = {
    ai_provider: "anthropic",
    ai_model: "claude-sonnet-4-20250514",
    ensemble_mode: true,
    auto_review: true,
    risk_threshold: 70,
};

export default function AIRulesPage() {
    const [values, setValues] = useState<SettingsValues>(defaultValues);
    const [message, setMessage] = useState<string>("");

    useEffect(() => {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as SettingsValues;
            setValues((prev) => ({ ...prev, ...parsed }));
        } catch {
            // Ignore malformed local settings and keep defaults.
        }
    }, []);

    const riskLabel = useMemo(() => {
        const score = Number(values.risk_threshold ?? 70);
        if (score >= 85) return "Very strict";
        if (score >= 70) return "Balanced";
        return "Lenient";
    }, [values.risk_threshold]);

    const setField = (key: string, value: SettingValue) => {
        setValues((prev) => ({ ...prev, [key]: value }));
    };

    const save = () => {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
            const existing = raw ? (JSON.parse(raw) as SettingsValues) : {};
            const merged = { ...existing, ...values };
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
            setMessage("AI rules saved.");
        } catch {
            setMessage("Could not save AI rules in this browser.");
        }
    };

    const reset = () => {
        setValues(defaultValues);
        setMessage("AI rules reset to defaults. Click Save to persist.");
    };

    return (
        <div className="min-h-screen bg-zinc-950 p-8">
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto">
                <div className="mb-8 flex items-start justify-between gap-4">
                    <div>
                        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-nexus-300 mb-3">
                            <Bot className="w-4 h-4" />
                            AI Rules
                        </div>
                        <h1 className="text-3xl font-bold text-white mb-2">AI Review Rules</h1>
                        <p className="text-zinc-400">
                            Dedicated controls for how Nexus AI reviews pull requests.
                        </p>
                    </div>
                    <Link href="/settings#ai" className="text-sm text-zinc-300 hover:text-white underline underline-offset-4">
                        Open full settings
                    </Link>
                </div>

                {message ? (
                    <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-200">
                        {message}
                    </div>
                ) : null}

                <div className="space-y-6">
                    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                        <h2 className="mb-4 flex items-center gap-2 text-white font-semibold">
                            <Sparkles className="w-4 h-4 text-nexus-400" />
                            Model Policy
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="space-y-2">
                                <span className="text-sm text-zinc-300">AI Provider</span>
                                <select
                                    value={String(values.ai_provider)}
                                    onChange={(e) => setField("ai_provider", e.target.value)}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                                >
                                    <option value="anthropic">Anthropic</option>
                                    <option value="openai">OpenAI</option>
                                    <option value="google">Google</option>
                                </select>
                            </label>
                            <label className="space-y-2">
                                <span className="text-sm text-zinc-300">AI Model</span>
                                <select
                                    value={String(values.ai_model)}
                                    onChange={(e) => setField("ai_model", e.target.value)}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                                >
                                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                                    <option value="gpt-4o">GPT-4o</option>
                                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                </select>
                            </label>
                        </div>
                    </section>

                    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                        <h2 className="mb-4 flex items-center gap-2 text-white font-semibold">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            Review Behavior
                        </h2>
                        <div className="space-y-4">
                            <label className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 p-3">
                                <div>
                                    <p className="text-white text-sm font-medium">Auto-review new PRs</p>
                                    <p className="text-zinc-500 text-xs">Automatically trigger AI review when PR opens.</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={Boolean(values.auto_review)}
                                    onChange={(e) => setField("auto_review", e.target.checked)}
                                    className="h-4 w-4 accent-nexus-500"
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 p-3">
                                <div>
                                    <p className="text-white text-sm font-medium">Ensemble debate mode</p>
                                    <p className="text-zinc-500 text-xs">Use multiple models for higher-confidence findings.</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={Boolean(values.ensemble_mode)}
                                    onChange={(e) => setField("ensemble_mode", e.target.checked)}
                                    className="h-4 w-4 accent-nexus-500"
                                />
                            </label>
                        </div>
                    </section>

                    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                        <h2 className="mb-4 flex items-center gap-2 text-white font-semibold">
                            <Gauge className="w-4 h-4 text-amber-400" />
                            Risk Threshold
                        </h2>
                        <div className="flex items-center gap-4">
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={Number(values.risk_threshold)}
                                onChange={(e) => setField("risk_threshold", Number(e.target.value))}
                                className="w-full accent-nexus-500"
                            />
                            <div className="text-right min-w-[90px]">
                                <div className="text-white font-semibold">{String(values.risk_threshold)}</div>
                                <div className="text-xs text-zinc-500">{riskLabel}</div>
                            </div>
                        </div>
                    </section>
                </div>

                <div className="mt-8 flex items-center gap-3">
                    <button
                        onClick={save}
                        className="px-4 py-2 rounded-lg bg-nexus-500 hover:bg-nexus-600 text-white text-sm font-medium transition-colors"
                    >
                        Save AI Rules
                    </button>
                    <button
                        onClick={reset}
                        className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800/60 text-sm transition-colors"
                    >
                        Reset
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

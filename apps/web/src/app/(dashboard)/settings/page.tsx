"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
    AlertTriangle,
    Bell,
    Bot,
    ChevronRight,
    Database,
    GitBranch,
    Globe,
    RefreshCw,
    Server,
    ShieldAlert,
} from "lucide-react";
import {
    IntegrationWebhookAuthEventListOptions,
    fetchIntegrationAlerts,
    fetchIntegrationConnections,
    fetchIntegrationMetrics,
    fetchIntegrationWebhookEvents,
    exportIntegrationWebhookAuthEvents,
    fetchIntegrationWebhookAuthEvents,
    processIntegrationWebhookEvent,
    retryDueIntegrationWebhooks,
    fetchSystemHealth,
    IntegrationAlertStatus,
    IntegrationConnection,
    IntegrationMetrics,
    IntegrationWebhookEvent,
    IntegrationWebhookAuthEvent,
} from "../../../lib/api";

type SelectOption = {
    label: string;
    value: string;
};

type ToggleSetting = {
    key: string;
    label: string;
    description: string;
    type: "toggle";
};

type SelectSetting = {
    key: string;
    label: string;
    description: string;
    type: "select";
    options: SelectOption[];
};

type SliderSetting = {
    key: string;
    label: string;
    description: string;
    type: "slider";
    min: number;
    max: number;
};

type SettingItem = ToggleSetting | SelectSetting | SliderSetting;

type SettingsSection = {
    id: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    settings?: SettingItem[];
    links?: Array<{ label: string; code: string; status: "connected" | "disconnected" | "coming_soon" }>;
};

const sections: SettingsSection[] = [
    {
        id: "ai",
        title: "AI Configuration",
        icon: Bot,
        description: "Configure AI models and review automation",
        settings: [
            {
                key: "ai_provider",
                label: "AI Provider",
                type: "select",
                description: "Primary provider for code reviews",
                options: [
                    { label: "Anthropic", value: "anthropic" },
                    { label: "OpenAI", value: "openai" },
                    { label: "Google", value: "google" },
                ],
            },
            {
                key: "ai_model",
                label: "AI Model",
                type: "select",
                description: "Model used for analysis",
                options: [
                    { label: "Claude Sonnet 4", value: "claude-sonnet-4-20250514" },
                    { label: "GPT-4o", value: "gpt-4o" },
                    { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
                ],
            },
            {
                key: "ensemble_mode",
                label: "Ensemble Debate Mode",
                type: "toggle",
                description: "Use multiple models for critical reviews",
            },
            {
                key: "auto_review",
                label: "Auto Review on PR",
                type: "toggle",
                description: "Automatically review new pull requests",
            },
            {
                key: "risk_threshold",
                label: "Risk Alert Threshold",
                type: "slider",
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
        description: "Configure queue and merge behavior",
        settings: [
            {
                key: "merge_queue_enabled",
                label: "Enable Merge Queue",
                type: "toggle",
                description: "Use automated merge queue",
            },
            {
                key: "require_ci",
                label: "Require CI Pass",
                type: "toggle",
                description: "PRs must pass CI before merging",
            },
            {
                key: "auto_rebase",
                label: "Auto Rebase",
                type: "toggle",
                description: "Automatically rebase when conflicts are detected",
            },
            {
                key: "merge_method",
                label: "Merge Method",
                type: "select",
                description: "How to merge approved PRs",
                options: [
                    { label: "Merge commit", value: "merge" },
                    { label: "Squash", value: "squash" },
                    { label: "Rebase", value: "rebase" },
                ],
            },
        ],
    },
    {
        id: "notifications",
        title: "Notifications",
        icon: Bell,
        description: "Configure alert and delivery preferences",
        settings: [
            {
                key: "email_reviews",
                label: "Email for Reviews",
                type: "toggle",
                description: "Receive email for review requests",
            },
            {
                key: "email_ai_findings",
                label: "Email for AI Findings",
                type: "toggle",
                description: "Receive email for high-risk AI findings",
            },
            {
                key: "slack_enabled",
                label: "Slack Integration",
                type: "toggle",
                description: "Send notifications to Slack",
            },
            {
                key: "desktop_notifications",
                label: "Desktop Notifications",
                type: "toggle",
                description: "Enable browser push notifications",
            },
        ],
    },
    {
        id: "integrations",
        title: "Integrations",
        icon: Globe,
        description: "Connect external tools",
        links: [
            { label: "GitHub", code: "GH", status: "connected" },
            { label: "GitLab", code: "GL", status: "disconnected" },
            { label: "Slack", code: "SL", status: "disconnected" },
            { label: "Jira", code: "JR", status: "disconnected" },
            { label: "Linear", code: "LN", status: "coming_soon" },
        ],
    },
];

const initialValues: Record<string, string | number | boolean> = {
    ai_provider: "anthropic",
    ai_model: "claude-sonnet-4-20250514",
    ensemble_mode: true,
    auto_review: true,
    risk_threshold: 70,
    merge_queue_enabled: true,
    require_ci: true,
    auto_rebase: true,
    merge_method: "squash",
    email_reviews: true,
    email_ai_findings: false,
    slack_enabled: false,
    desktop_notifications: true,
};

const SETTINGS_STORAGE_KEY = "nexus.settings.v1";

function statusLabel(status: "connected" | "disconnected" | "coming_soon"): string {
    if (status === "connected") return "Connected";
    if (status === "coming_soon") return "Coming Soon";
    return "Connect";
}

function statusClass(status: "connected" | "disconnected" | "coming_soon"): string {
    if (status === "connected") return "text-green-400";
    if (status === "coming_soon") return "text-zinc-500";
    return "text-zinc-400";
}

type AuthProviderFilter = "all" | "slack" | "linear" | "jira";
type AuthOutcomeFilter = "all" | "rejected" | "config_error";
type WebhookStatusFilter = "all" | "received" | "processed" | "failed" | "dead_letter";

const WEBHOOK_DIAGNOSTICS_PAGE_SIZE = 12;
const WEBHOOK_RECOVERY_PAGE_SIZE = 8;

function formatAuthReason(reason: string): string {
    return reason.split("_").join(" ");
}

function formatWebhookStatus(status: IntegrationWebhookEvent["status"]): string {
    return status.split("_").join(" ");
}

function formatAuthTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) return error.message;
    return fallback;
}

function connectionStatusForProvider(
    connections: IntegrationConnection[],
    provider: "slack" | "linear" | "jira"
): "connected" | "disconnected" | "coming_soon" {
    const providerConnections = connections.filter((connection) => connection.provider === provider);
    if (providerConnections.length === 0) return "disconnected";
    if (providerConnections.some((connection) => connection.status === "active")) return "connected";
    return "disconnected";
}

export default function SettingsPage() {
    const [values, setValues] = useState(initialValues);
    const [saveMessage, setSaveMessage] = useState<string>("");
    const [authProvider, setAuthProvider] = useState<AuthProviderFilter>("all");
    const [authOutcome, setAuthOutcome] = useState<AuthOutcomeFilter>("all");
    const [authReason, setAuthReason] = useState("");
    const [authSinceMinutes, setAuthSinceMinutes] = useState<number>(60);
    const [authRepoId, setAuthRepoId] = useState("");
    const [authPage, setAuthPage] = useState(0);
    const [webhookStatusFilter, setWebhookStatusFilter] = useState<WebhookStatusFilter>("all");
    const [retryingDueWebhooks, setRetryingDueWebhooks] = useState(false);
    const [processingWebhookId, setProcessingWebhookId] = useState<string | null>(null);
    const [webhookActionMessage, setWebhookActionMessage] = useState("");
    const [webhookActionError, setWebhookActionError] = useState("");
    const [exportingFormat, setExportingFormat] = useState<"json" | "csv" | null>(null);
    const [exportError, setExportError] = useState("");

    const { data: health, isLoading: healthLoading } = useQuery({
        queryKey: ["system", "health"],
        queryFn: fetchSystemHealth,
        refetchInterval: 30_000,
    });

    const authOffset = authPage * WEBHOOK_DIAGNOSTICS_PAGE_SIZE;
    const diagnosticsQuery: IntegrationWebhookAuthEventListOptions = {
        provider: authProvider === "all" ? undefined : authProvider,
        outcome: authOutcome === "all" ? undefined : authOutcome,
        reason: authReason.trim() || undefined,
        sinceMinutes: authSinceMinutes,
        repoId: authRepoId.trim() || undefined,
    };
    const {
        data: authEventsData,
        isLoading: authEventsLoading,
        isFetching: authEventsFetching,
        error: authEventsError,
        refetch: refetchAuthEvents,
    } = useQuery({
        queryKey: [
            "settings",
            "webhook-auth-events",
            authProvider,
            authOutcome,
            authReason,
            authSinceMinutes,
            authRepoId,
            authOffset,
        ],
        queryFn: () =>
            fetchIntegrationWebhookAuthEvents({
                ...diagnosticsQuery,
                limit: WEBHOOK_DIAGNOSTICS_PAGE_SIZE,
                offset: authOffset,
            }),
        refetchInterval: 30_000,
    });
    const integrationRepoId = authRepoId.trim() || undefined;
    const {
        data: integrationConnectionsData,
        isLoading: integrationConnectionsLoading,
        isFetching: integrationConnectionsFetching,
        error: integrationConnectionsError,
        refetch: refetchIntegrationConnections,
    } = useQuery({
        queryKey: ["settings", "integration-connections", integrationRepoId],
        queryFn: () =>
            fetchIntegrationConnections({
                repoId: integrationRepoId,
                limit: 50,
                offset: 0,
            }),
        refetchInterval: 30_000,
    });
    const {
        data: integrationMetricsData,
        isLoading: integrationMetricsLoading,
        isFetching: integrationMetricsFetching,
        error: integrationMetricsError,
        refetch: refetchIntegrationMetrics,
    } = useQuery({
        queryKey: ["settings", "integration-metrics", integrationRepoId],
        queryFn: () => fetchIntegrationMetrics(integrationRepoId),
        refetchInterval: 30_000,
    });
    const {
        data: integrationAlertsData,
        isLoading: integrationAlertsLoading,
        isFetching: integrationAlertsFetching,
        error: integrationAlertsError,
        refetch: refetchIntegrationAlerts,
    } = useQuery({
        queryKey: ["settings", "integration-alerts", integrationRepoId],
        queryFn: () => fetchIntegrationAlerts({ repoId: integrationRepoId }),
        refetchInterval: 30_000,
    });
    const {
        data: webhookEventsData,
        isLoading: webhookEventsLoading,
        isFetching: webhookEventsFetching,
        error: webhookEventsError,
        refetch: refetchWebhookEvents,
    } = useQuery({
        queryKey: [
            "settings",
            "integration-webhooks",
            integrationRepoId,
            authProvider,
            webhookStatusFilter,
        ],
        queryFn: () =>
            fetchIntegrationWebhookEvents({
                repoId: integrationRepoId,
                provider: authProvider === "all" ? undefined : authProvider,
                status: webhookStatusFilter === "all" ? undefined : webhookStatusFilter,
                limit: WEBHOOK_RECOVERY_PAGE_SIZE,
                offset: 0,
            }),
        refetchInterval: 30_000,
    });

    const healthSummary = useMemo(() => {
        if (!health) {
            return {
                statusText: healthLoading ? "Checking" : "Unavailable",
                statusClass: "text-zinc-400",
            };
        }

        return {
            statusText: health.status === "healthy" ? "Healthy" : "Degraded",
            statusClass: health.status === "healthy" ? "text-green-400" : "text-yellow-400",
        };
    }, [health, healthLoading]);

    const authEvents = authEventsData?.events || [];
    const integrationConnections = integrationConnectionsData?.connections || [];
    const webhookEvents = webhookEventsData?.events || [];
    const hasNextAuthPage = authEvents.length === WEBHOOK_DIAGNOSTICS_PAGE_SIZE;
    const integrationLoading =
        integrationConnectionsLoading || integrationMetricsLoading || integrationAlertsLoading || webhookEventsLoading;
    const integrationFetching =
        integrationConnectionsFetching || integrationMetricsFetching || integrationAlertsFetching || webhookEventsFetching;
    const integrationStatusByProvider = useMemo(() => {
        return {
            slack: connectionStatusForProvider(integrationConnections, "slack"),
            linear: connectionStatusForProvider(integrationConnections, "linear"),
            jira: connectionStatusForProvider(integrationConnections, "jira"),
        };
    }, [integrationConnections]);
    const integrationSnapshot = useMemo((): {
        metrics: IntegrationMetrics | null;
        alerts: IntegrationAlertStatus | null;
    } => {
        return {
            metrics: integrationMetricsData || null,
            alerts: integrationAlertsData || null,
        };
    }, [integrationMetricsData, integrationAlertsData]);
    const authEventsSummary = useMemo(() => {
        const missingSignature = authEvents.filter((event) => event.reason === "missing_signature_headers").length;
        const staleTimestamp = authEvents.filter((event) => event.reason === "timestamp_out_of_window").length;
        const invalidSignature = authEvents.filter((event) => event.reason === "invalid_signature").length;
        return {
            missingSignature,
            staleTimestamp,
            invalidSignature,
        };
    }, [authEvents]);

    const setValue = (key: string, value: string | number | boolean) => {
        setValues((prev) => ({ ...prev, [key]: value }));
        setSaveMessage("");
    };

    useEffect(() => {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return;
            setValues((prev) => ({ ...prev, ...(parsed as Record<string, string | number | boolean>) }));
            setSaveMessage("Loaded saved settings from this browser.");
        } catch {
            setSaveMessage("Saved settings were invalid and were ignored.");
        }
    }, []);

    const onSave = () => {
        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(values));
            setSaveMessage("Settings saved in this browser.");
        } catch {
            setSaveMessage("Could not save settings in this browser.");
        }
    };

    const onResetDefaults = () => {
        setValues(initialValues);
        setSaveMessage("Settings reset to defaults. Click Save Changes to persist.");
    };

    const onResetDiagnostics = () => {
        setAuthProvider("all");
        setAuthOutcome("all");
        setAuthReason("");
        setAuthSinceMinutes(60);
        setAuthRepoId("");
        setAuthPage(0);
        setWebhookStatusFilter("all");
        setWebhookActionMessage("");
        setWebhookActionError("");
    };

    const downloadBlob = (filename: string, blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };

    const onExportDiagnostics = async (format: "json" | "csv") => {
        setExportError("");
        setExportingFormat(format);
        try {
            const { blob, filename } = await exportIntegrationWebhookAuthEvents(diagnosticsQuery, format);
            downloadBlob(filename, blob);
        } catch (error) {
            setExportError((error as Error).message || "Failed to export diagnostics.");
        } finally {
            setExportingFormat(null);
        }
    };

    const onRetryDueWebhooks = async () => {
        setWebhookActionMessage("");
        setWebhookActionError("");
        setRetryingDueWebhooks(true);
        try {
            const result = await retryDueIntegrationWebhooks(20);
            setWebhookActionMessage(`Retried ${result.processed} due webhook event(s).`);
            await Promise.all([refetchWebhookEvents(), refetchIntegrationMetrics(), refetchIntegrationAlerts()]);
        } catch (error) {
            setWebhookActionError(getErrorMessage(error, "Failed to retry due webhooks."));
        } finally {
            setRetryingDueWebhooks(false);
        }
    };

    const onProcessWebhook = async (eventId: string) => {
        setWebhookActionMessage("");
        setWebhookActionError("");
        setProcessingWebhookId(eventId);
        try {
            const result = await processIntegrationWebhookEvent(eventId, {});
            setWebhookActionMessage(
                `Webhook ${result.event.externalEventId} is now ${formatWebhookStatus(result.event.status)}.`
            );
            await Promise.all([refetchWebhookEvents(), refetchIntegrationMetrics(), refetchIntegrationAlerts()]);
        } catch (error) {
            setWebhookActionError(getErrorMessage(error, "Failed to process webhook event."));
        } finally {
            setProcessingWebhookId(null);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
                <p className="text-zinc-400">Configure NEXUS to fit your workflow</p>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5"
            >
                <h2 className="text-white font-semibold mb-4">System Status</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-zinc-500">API</span>
                            <Server className="w-4 h-4 text-nexus-400" />
                        </div>
                        <div className={`font-semibold ${healthSummary.statusClass}`}>{healthSummary.statusText}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-zinc-500">Database</span>
                            <Database className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className={health?.database.connected ? "font-semibold text-green-400" : "font-semibold text-yellow-400"}>
                            {health?.database.connected ? "Connected" : "Disconnected"}
                        </div>
                        <div className="text-zinc-500 text-xs mt-1">
                            {health?.database.latencyMs ?? "-"} ms
                        </div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-zinc-500">Realtime</span>
                            <Globe className="w-4 h-4 text-purple-400" />
                        </div>
                        <div className="font-semibold text-zinc-300">
                            {health?.websocket?.status || "Unknown"}
                        </div>
                    </div>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-5"
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-white font-semibold mb-1 flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-yellow-400" />
                            Integration Diagnostics
                        </h2>
                        <p className="text-sm text-zinc-500">
                            Webhook auth rejection telemetry for debugging signature and timestamp failures.
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            void Promise.all([
                                refetchAuthEvents(),
                                refetchIntegrationConnections(),
                                refetchIntegrationMetrics(),
                                refetchIntegrationAlerts(),
                                refetchWebhookEvents(),
                            ]);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800/70 transition-colors text-sm"
                    >
                        <RefreshCw className={`w-4 h-4 ${authEventsFetching || integrationFetching ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs text-zinc-500">Provider</label>
                        <select
                            value={authProvider}
                            onChange={(e) => {
                                setAuthProvider(e.target.value as AuthProviderFilter);
                                setAuthPage(0);
                            }}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
                        >
                            <option value="all">All providers</option>
                            <option value="slack">Slack</option>
                            <option value="linear">Linear</option>
                            <option value="jira">Jira</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-zinc-500">Outcome</label>
                        <select
                            value={authOutcome}
                            onChange={(e) => {
                                setAuthOutcome(e.target.value as AuthOutcomeFilter);
                                setAuthPage(0);
                            }}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
                        >
                            <option value="all">All outcomes</option>
                            <option value="rejected">Rejected</option>
                            <option value="config_error">Config Error</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-zinc-500">Since</label>
                        <select
                            value={String(authSinceMinutes)}
                            onChange={(e) => {
                                setAuthSinceMinutes(Number(e.target.value));
                                setAuthPage(0);
                            }}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
                        >
                            <option value="15">Last 15 min</option>
                            <option value="60">Last 60 min</option>
                            <option value="360">Last 6 hours</option>
                            <option value="1440">Last 24 hours</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-zinc-500">Reason</label>
                        <input
                            value={authReason}
                            onChange={(e) => {
                                setAuthReason(e.target.value);
                                setAuthPage(0);
                            }}
                            placeholder="missing_signature_headers"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-nexus-500"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-zinc-500">Repo Id (optional)</label>
                        <input
                            value={authRepoId}
                            onChange={(e) => {
                                setAuthRepoId(e.target.value);
                                setAuthPage(0);
                            }}
                            placeholder="repo uuid"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-nexus-500"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                    <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-yellow-400" />
                            Missing signature: {authEventsSummary.missingSignature}
                        </span>
                        <span>Stale timestamp: {authEventsSummary.staleTimestamp}</span>
                        <span>Invalid signature: {authEventsSummary.invalidSignature}</span>
                    </div>
                    <button
                        onClick={onResetDiagnostics}
                        className="text-zinc-300 hover:text-white transition-colors"
                    >
                        Clear Filters
                    </button>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-white">Integrations Operations</h3>
                            <p className="text-xs text-zinc-500">
                                Connection health, delivery/webhook metrics, and alert state
                                {integrationRepoId ? ` for repo ${integrationRepoId}.` : "."}
                            </p>
                        </div>
                        <span
                            className={`text-xs font-medium ${
                                integrationSnapshot.alerts?.status === "critical"
                                    ? "text-red-400"
                                    : integrationSnapshot.alerts?.status === "warning"
                                      ? "text-yellow-400"
                                      : "text-green-400"
                            }`}
                        >
                            {integrationSnapshot.alerts?.status || "unknown"}
                        </span>
                    </div>

                    {integrationLoading ? (
                        <div className="text-sm text-zinc-400">Loading integration operations snapshot...</div>
                    ) : integrationConnectionsError || integrationMetricsError || integrationAlertsError ? (
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-3 py-2">
                            {[
                                integrationConnectionsError
                                    ? getErrorMessage(integrationConnectionsError, "Connections unavailable")
                                    : null,
                                integrationMetricsError
                                    ? getErrorMessage(integrationMetricsError, "Metrics unavailable")
                                    : null,
                                integrationAlertsError
                                    ? getErrorMessage(integrationAlertsError, "Alerts unavailable")
                                    : null,
                            ]
                                .filter(Boolean)
                                .join(" | ")}
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                                <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                                    <div className="text-zinc-500 text-xs">Success Rate</div>
                                    <div className="font-semibold text-zinc-100">
                                        {integrationSnapshot.metrics?.successRatePct ?? 0}%
                                    </div>
                                </div>
                                <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                                    <div className="text-zinc-500 text-xs">Delivery Dead Letters</div>
                                    <div className="font-semibold text-zinc-100">
                                        {integrationSnapshot.metrics?.totals.deadLetter ?? 0}
                                    </div>
                                </div>
                                <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                                    <div className="text-zinc-500 text-xs">Webhook Auth Failures</div>
                                    <div className="font-semibold text-zinc-100">
                                        {integrationSnapshot.metrics?.totals.webhookAuthFailures ?? 0}
                                    </div>
                                </div>
                                <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                                    <div className="text-zinc-500 text-xs">Retry Queue</div>
                                    <div className="font-semibold text-zinc-100">
                                        {(integrationSnapshot.metrics?.retryQueue.notificationQueued ?? 0) +
                                            (integrationSnapshot.metrics?.retryQueue.webhookQueued ?? 0)}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                {(["slack", "linear", "jira"] as const).map((provider) => {
                                    const providerStatus = integrationStatusByProvider[provider];
                                    const providerCount = integrationConnections.filter(
                                        (connection) => connection.provider === provider
                                    ).length;
                                    return (
                                        <div
                                            key={provider}
                                            className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 flex items-center justify-between"
                                        >
                                            <div className="capitalize text-zinc-300">{provider}</div>
                                            <div className={`text-xs ${statusClass(providerStatus)}`}>
                                                {statusLabel(providerStatus)} ({providerCount})
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="text-xs text-zinc-400">
                                {integrationSnapshot.alerts?.alerts.length
                                    ? `${integrationSnapshot.alerts.alerts.length} active alert(s): ${integrationSnapshot.alerts.alerts
                                          .slice(0, 2)
                                          .map((alert) => alert.code)
                                          .join(", ")}`
                                    : "No active integration alerts."}
                                {integrationFetching ? " Refreshing..." : ""}
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h4 className="text-sm font-semibold text-white">Webhook Recovery Queue</h4>
                                        <p className="text-xs text-zinc-500">
                                            Process failed/received webhook events and trigger due retries.
                                        </p>
                                    </div>
                                    <button
                                        onClick={onRetryDueWebhooks}
                                        disabled={retryingDueWebhooks}
                                        className="px-3 py-1.5 rounded border border-zinc-700 text-xs text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                                    >
                                        {retryingDueWebhooks ? "Retrying..." : "Retry Due"}
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 text-xs">
                                    <label className="text-zinc-500">Status</label>
                                    <select
                                        value={webhookStatusFilter}
                                        onChange={(e) => setWebhookStatusFilter(e.target.value as WebhookStatusFilter)}
                                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
                                    >
                                        <option value="all">All</option>
                                        <option value="received">Received</option>
                                        <option value="failed">Failed</option>
                                        <option value="processed">Processed</option>
                                        <option value="dead_letter">Dead Letter</option>
                                    </select>
                                </div>

                                {webhookEventsLoading ? (
                                    <div className="text-sm text-zinc-400">Loading webhook recovery events...</div>
                                ) : webhookEventsError ? (
                                    <div className="rounded bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-3 py-2">
                                        Failed to load webhook events: {getErrorMessage(webhookEventsError, "Unavailable")}
                                    </div>
                                ) : webhookEvents.length === 0 ? (
                                    <div className="text-sm text-zinc-500">No webhook events for selected filters.</div>
                                ) : (
                                    <div className="rounded border border-zinc-800 overflow-x-auto">
                                        <div className="min-w-[860px]">
                                            <div className="grid grid-cols-[90px_140px_1fr_110px_120px_120px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 bg-zinc-950/60">
                                                <span>Provider</span>
                                                <span>Status</span>
                                                <span>Event</span>
                                                <span>Attempts</span>
                                                <span>Created</span>
                                                <span>Action</span>
                                            </div>
                                            <div className="divide-y divide-zinc-800">
                                                {webhookEvents.map((event) => {
                                                    const actionable =
                                                        event.status === "received" || event.status === "failed";
                                                    return (
                                                        <div
                                                            key={event.id}
                                                            className="grid grid-cols-[90px_140px_1fr_110px_120px_120px] gap-2 px-3 py-2 text-sm text-zinc-200 items-center"
                                                        >
                                                            <span className="capitalize">{event.provider}</span>
                                                            <span
                                                                className={
                                                                    event.status === "failed" || event.status === "dead_letter"
                                                                        ? "text-red-300"
                                                                        : event.status === "processed"
                                                                          ? "text-green-300"
                                                                          : "text-yellow-300"
                                                                }
                                                            >
                                                                {formatWebhookStatus(event.status)}
                                                            </span>
                                                            <div className="min-w-0">
                                                                <div className="truncate">{event.eventType}</div>
                                                                <div className="text-xs text-zinc-500 truncate">
                                                                    {event.externalEventId}
                                                                </div>
                                                            </div>
                                                            <span>
                                                                {event.attempts}/{event.maxAttempts}
                                                            </span>
                                                            <span className="text-xs text-zinc-400">
                                                                {formatAuthTimestamp(event.createdAt)}
                                                            </span>
                                                            <button
                                                                onClick={() => onProcessWebhook(event.id)}
                                                                disabled={!actionable || processingWebhookId === event.id}
                                                                className="px-2 py-1 rounded border border-zinc-700 text-xs text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                                                            >
                                                                {processingWebhookId === event.id ? "Processing..." : "Process"}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {webhookActionMessage ? (
                                    <div className="text-xs text-green-300 bg-green-500/10 border border-green-500/20 rounded px-3 py-2">
                                        {webhookActionMessage}
                                    </div>
                                ) : null}
                                {webhookActionError ? (
                                    <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                                        {webhookActionError}
                                    </div>
                                ) : null}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-zinc-500">
                        Export all currently filtered auth events (up to 5000 rows).
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onExportDiagnostics("json")}
                            disabled={Boolean(exportingFormat)}
                            className="px-3 py-1.5 rounded border border-zinc-700 text-sm text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                        >
                            {exportingFormat === "json" ? "Exporting..." : "Export JSON"}
                        </button>
                        <button
                            onClick={() => onExportDiagnostics("csv")}
                            disabled={Boolean(exportingFormat)}
                            className="px-3 py-1.5 rounded border border-zinc-700 text-sm text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                        >
                            {exportingFormat === "csv" ? "Exporting..." : "Export CSV"}
                        </button>
                    </div>
                </div>
                {exportError ? (
                    <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        {exportError}
                    </div>
                ) : null}

                {authEventsLoading ? (
                    <div className="py-8 text-sm text-zinc-400">Loading diagnostic events...</div>
                ) : authEventsError ? (
                    <div className="py-6 px-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                        Failed to load diagnostics: {(authEventsError as Error).message}
                    </div>
                ) : authEvents.length === 0 ? (
                    <div className="py-8 text-sm text-zinc-500">No webhook auth failures for the selected filters.</div>
                ) : (
                    <div className="rounded-lg border border-zinc-800 overflow-x-auto">
                        <div className="min-w-[920px]">
                            <div className="grid grid-cols-[130px_120px_1fr_120px_90px_90px_190px] gap-2 px-4 py-2 text-xs uppercase tracking-wide text-zinc-500 bg-zinc-950/60">
                                <span>Provider</span>
                                <span>Outcome</span>
                                <span>Reason / Event</span>
                                <span>Status</span>
                                <span>Sig</span>
                                <span>TS</span>
                                <span>Created</span>
                            </div>
                            <div className="divide-y divide-zinc-800">
                                {authEvents.map((event: IntegrationWebhookAuthEvent) => (
                                    <div
                                        key={event.id}
                                        className="grid grid-cols-[130px_120px_1fr_120px_90px_90px_190px] gap-2 px-4 py-3 text-sm text-zinc-200"
                                    >
                                        <span className="capitalize">{event.provider}</span>
                                        <span className={event.outcome === "config_error" ? "text-red-400" : "text-yellow-300"}>
                                            {event.outcome === "config_error" ? "Config Error" : "Rejected"}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="truncate">{formatAuthReason(event.reason)}</div>
                                            <div className="text-xs text-zinc-500 truncate">
                                                {event.eventType} - {event.externalEventId}
                                            </div>
                                        </div>
                                        <span>{event.statusCode}</span>
                                        <span>{event.signaturePresent ? "Present" : "Missing"}</span>
                                        <span>{event.timestampPresent ? "Present" : "Missing"}</span>
                                        <span className="text-xs text-zinc-400">{formatAuthTimestamp(event.createdAt)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <div className="text-xs text-zinc-500">
                        Page {authPage + 1} - showing up to {WEBHOOK_DIAGNOSTICS_PAGE_SIZE} events
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setAuthPage((prev) => Math.max(prev - 1, 0))}
                            disabled={authPage === 0}
                            className="px-3 py-1.5 rounded border border-zinc-700 text-sm text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setAuthPage((prev) => prev + 1)}
                            disabled={!hasNextAuthPage}
                            className="px-3 py-1.5 rounded border border-zinc-700 text-sm text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </motion.div>

            <div className="space-y-8">
                {sections.map((section, sectionIndex) => (
                    <motion.div
                        key={section.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: sectionIndex * 0.06 }}
                        className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden"
                    >
                        <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
                            <div className="p-2 bg-nexus-500/20 rounded-lg">
                                <section.icon className="w-5 h-5 text-nexus-400" />
                            </div>
                            <div>
                                <h2 className="font-semibold text-white">{section.title}</h2>
                                <p className="text-sm text-zinc-500">{section.description}</p>
                            </div>
                        </div>

                        {section.settings ? (
                            <div className="divide-y divide-zinc-800">
                                {section.settings.map((setting) => (
                                    <div key={setting.key} className="p-4 flex items-center justify-between gap-4">
                                        <div>
                                            <label className="text-white font-medium">{setting.label}</label>
                                            <p className="text-sm text-zinc-500">{setting.description}</p>
                                        </div>

                                        {setting.type === "toggle" && (
                                            <button
                                                onClick={() => setValue(setting.key, !values[setting.key])}
                                                className={`relative w-12 h-6 rounded-full transition-colors ${
                                                    values[setting.key] ? "bg-nexus-500" : "bg-zinc-700"
                                                }`}
                                            >
                                                <div
                                                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                                        values[setting.key] ? "right-1" : "left-1"
                                                    }`}
                                                />
                                            </button>
                                        )}

                                        {setting.type === "select" && (
                                            <select
                                                value={String(values[setting.key])}
                                                onChange={(e) => setValue(setting.key, e.target.value)}
                                                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
                                            >
                                                {setting.options.map((opt) => (
                                                    <option key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                        )}

                                        {setting.type === "slider" && (
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="range"
                                                    min={setting.min}
                                                    max={setting.max}
                                                    value={Number(values[setting.key])}
                                                    onChange={(e) => setValue(setting.key, Number(e.target.value))}
                                                    className="w-32 accent-nexus-500"
                                                />
                                                <span className="text-white text-sm w-8 text-right">
                                                    {values[setting.key]}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {section.links ? (
                            <div className="divide-y divide-zinc-800">
                                {section.links.map((link) => (
                                    <div
                                        key={link.label}
                                        className="p-4 flex items-center justify-between hover:bg-zinc-800/50 cursor-pointer transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="w-7 h-7 rounded-md bg-zinc-800 text-zinc-300 text-xs grid place-items-center font-semibold">
                                                {link.code}
                                            </span>
                                            <span className="text-white font-medium">{link.label}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm ${statusClass(link.status)}`}>
                                                {statusLabel(link.status)}
                                            </span>
                                            <ChevronRight className="w-4 h-4 text-zinc-500" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </motion.div>
                ))}
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="p-6 bg-red-950/20 border border-red-500/30 rounded-xl"
            >
                <h2 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h2>
                <p className="text-sm text-zinc-400 mb-4">These actions are destructive and cannot be undone.</p>
                <div className="flex gap-3">
                    <button
                        onClick={onResetDefaults}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium text-zinc-300 transition-colors"
                    >
                        Reset AI Training
                    </button>
                    <button className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 rounded-lg text-sm font-medium text-red-400 transition-colors">
                        Delete Organization
                    </button>
                </div>
            </motion.div>

            <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500">{saveMessage}</span>
                <button
                    onClick={onSave}
                    className="px-6 py-2 bg-nexus-600 hover:bg-nexus-500 rounded-lg font-medium transition-colors"
                >
                    Save Changes
                </button>
            </div>
        </div>
    );
}

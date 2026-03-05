"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    acknowledgeIntegrationAlert,
    bulkTriageIntegrationAlerts,
    fetchIntegrationAlertTriageAudits,
    IntegrationWebhookAuthEventListOptions,
    fetchIntegrationConnectionActionAudits,
    fetchIntegrationAlerts,
    fetchIntegrationConnections,
    fetchIntegrationIssueLinkActionAudits,
    fetchIntegrationIssueLinks,
    fetchIntegrationIncidentTimeline,
    fetchIntegrationIncidentSlaSummary,
    fetchIntegrationMetrics,
    fetchIntegrationNotificationActionAudits,
    fetchIntegrationNotifications,
    fetchIntegrationWebhookActionAudits,
    fetchIntegrationWebhookEvents,
    deliverIntegrationNotification,
    exportIntegrationWebhookAuthEvents,
    fetchIntegrationWebhookAuthEvents,
    processIntegrationWebhookEvent,
    setIntegrationConnectionStatus,
    validateIntegrationConnection,
    retryIntegrationIssueLinkSyncs,
    retryDueIntegrationNotifications,
    retryDueIntegrationWebhooks,
    syncIntegrationIssueLink,
    fetchSystemHealth,
    muteIntegrationAlert,
    IntegrationAlertStatus,
    IntegrationConnectionActionAuditEvent,
    IntegrationConnection,
    IntegrationAlertTriageAuditEvent,
    IntegrationIncidentTimelineEntry,
    IntegrationIncidentSlaSummary,
    IntegrationIssueLink,
    IntegrationIssueLinkActionAuditEvent,
    IntegrationMetrics,
    IntegrationNotificationActionAuditEvent,
    IntegrationNotificationDelivery,
    IntegrationWebhookActionAuditEvent,
    IntegrationWebhookEvent,
    IntegrationWebhookAuthEvent,
    unmuteIntegrationAlert,
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
const REALTIME_REFRESH_DEBOUNCE_MS = 1500;

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
type WebhookActionMode = "process" | "fail";
type ConnectionActionMode = "validate" | "fail_validate" | "enable" | "disable";
type AlertActionMode = "acknowledge" | "mute" | "unmute";
type AlertTriageActionFilter = "all" | "acknowledge" | "mute" | "unmute";
type NotificationStatusFilter = "all" | "pending" | "retrying" | "delivered" | "failed" | "dead_letter";
type NotificationActionMode = "deliver" | "fail";
type IssueLinkStatusFilter = "all" | "linked" | "sync_pending" | "sync_failed";
type IssueLinkActionMode = "sync" | "fail";

const WEBHOOK_DIAGNOSTICS_PAGE_SIZE = 12;
const WEBHOOK_RECOVERY_PAGE_SIZE = 8;

function formatAuthReason(reason: string): string {
    return reason.split("_").join(" ");
}

function formatWebhookStatus(status: IntegrationWebhookEvent["status"]): string {
    return status.split("_").join(" ");
}

function formatNotificationStatus(status: IntegrationNotificationDelivery["status"]): string {
    return status.split("_").join(" ");
}

function formatIssueLinkStatus(status: IntegrationIssueLink["status"]): string {
    return status.split("_").join(" ");
}

function formatWebhookAuditAction(action: string): string {
    const normalized = action.startsWith("integration.webhook.") ? action.slice("integration.webhook.".length) : action;
    return normalized.split("_").join(" ");
}

function formatNotificationAuditAction(action: string): string {
    const normalized = action.startsWith("integration.notification.")
        ? action.slice("integration.notification.".length)
        : action;
    return normalized.split("_").join(" ");
}

function formatIssueLinkAuditAction(action: string): string {
    const normalized = action.startsWith("integration.issue_link.") ? action.slice("integration.issue_link.".length) : action;
    return normalized.split("_").join(" ");
}

function formatConnectionAuditAction(action: string): string {
    const normalized = action.startsWith("integration.connection.") ? action.slice("integration.connection.".length) : action;
    return normalized.split("_").join(" ");
}

function formatAlertTriageAction(action: string): string {
    const normalized = action.startsWith("integration.alert.") ? action.slice("integration.alert.".length) : action;
    return normalized.split("_").join(" ");
}

function formatIncidentScope(scope: IntegrationIncidentTimelineEntry["scope"]): string {
    return scope.split("_").join(" ");
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
    const [notificationStatusFilter, setNotificationStatusFilter] = useState<NotificationStatusFilter>("all");
    const [issueLinkStatusFilter, setIssueLinkStatusFilter] = useState<IssueLinkStatusFilter>("all");
    const [timelineScopeFilter, setTimelineScopeFilter] = useState<
        "all" | "alert_triage" | "webhook_auth" | "webhook_processing" | "notification_delivery" | "issue_sync"
    >("all");
    const [timelineSeverityFilter, setTimelineSeverityFilter] = useState<"all" | "warning" | "critical">("all");
    const [warningSlaMinutes, setWarningSlaMinutes] = useState(60);
    const [criticalSlaMinutes, setCriticalSlaMinutes] = useState(30);
    const [triageAuditActionFilter, setTriageAuditActionFilter] = useState<AlertTriageActionFilter>("all");
    const [triageAuditActorFilter, setTriageAuditActorFilter] = useState("");
    const [triageAuditAlertCodeFilter, setTriageAuditAlertCodeFilter] = useState("");
    const [retryingDueWebhooks, setRetryingDueWebhooks] = useState(false);
    const [retryingDueNotifications, setRetryingDueNotifications] = useState(false);
    const [retryingIssueLinkSyncs, setRetryingIssueLinkSyncs] = useState(false);
    const [processingConnectionAction, setProcessingConnectionAction] = useState<{
        id: string;
        mode: ConnectionActionMode;
    } | null>(null);
    const [processingWebhookAction, setProcessingWebhookAction] = useState<{
        id: string;
        mode: WebhookActionMode;
    } | null>(null);
    const [processingNotificationAction, setProcessingNotificationAction] = useState<{
        id: string;
        mode: NotificationActionMode;
    } | null>(null);
    const [processingIssueLinkAction, setProcessingIssueLinkAction] = useState<{
        id: string;
        mode: IssueLinkActionMode;
    } | null>(null);
    const [webhookActionMessage, setWebhookActionMessage] = useState("");
    const [webhookActionError, setWebhookActionError] = useState("");
    const [notificationActionMessage, setNotificationActionMessage] = useState("");
    const [notificationActionError, setNotificationActionError] = useState("");
    const [issueLinkActionMessage, setIssueLinkActionMessage] = useState("");
    const [issueLinkActionError, setIssueLinkActionError] = useState("");
    const [connectionActionMessage, setConnectionActionMessage] = useState("");
    const [connectionActionError, setConnectionActionError] = useState("");
    const [processingAlertAction, setProcessingAlertAction] = useState<{
        code: string;
        mode: AlertActionMode;
    } | null>(null);
    const [bulkAlertActionMode, setBulkAlertActionMode] = useState<"acknowledge" | "mute" | "unmute" | null>(null);
    const [alertActionMessage, setAlertActionMessage] = useState("");
    const [alertActionError, setAlertActionError] = useState("");
    const [exportingFormat, setExportingFormat] = useState<"json" | "csv" | null>(null);
    const [exportError, setExportError] = useState("");
    const lastRealtimeRefreshAtRef = useRef(0);

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
        data: connectionActionAuditsData,
        isLoading: connectionActionAuditsLoading,
        isFetching: connectionActionAuditsFetching,
        error: connectionActionAuditsError,
        refetch: refetchConnectionActionAudits,
    } = useQuery({
        queryKey: ["settings", "integration-connection-action-audits", integrationRepoId],
        queryFn: () =>
            fetchIntegrationConnectionActionAudits({
                repoId: integrationRepoId,
                limit: 8,
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
        data: integrationIncidentTimelineData,
        isLoading: integrationIncidentTimelineLoading,
        isFetching: integrationIncidentTimelineFetching,
        error: integrationIncidentTimelineError,
        refetch: refetchIntegrationIncidentTimeline,
    } = useQuery({
        queryKey: [
            "settings",
            "integration-incident-timeline",
            integrationRepoId,
            authProvider,
            timelineScopeFilter,
            timelineSeverityFilter,
        ],
        queryFn: () =>
            fetchIntegrationIncidentTimeline({
                repoId: integrationRepoId,
                provider: authProvider === "all" ? undefined : authProvider,
                scope: timelineScopeFilter === "all" ? undefined : timelineScopeFilter,
                severity: timelineSeverityFilter === "all" ? undefined : timelineSeverityFilter,
                sinceMinutes: authSinceMinutes,
                limit: 20,
            }),
        refetchInterval: 30_000,
    });
    const {
        data: triageAuditsData,
        isLoading: triageAuditsLoading,
        isFetching: triageAuditsFetching,
        error: triageAuditsError,
        refetch: refetchTriageAudits,
    } = useQuery({
        queryKey: [
            "settings",
            "integration-alert-triage-audits",
            integrationRepoId,
            triageAuditActionFilter,
            triageAuditActorFilter,
            triageAuditAlertCodeFilter,
            authSinceMinutes,
        ],
        queryFn: () =>
            fetchIntegrationAlertTriageAudits({
                repoId: integrationRepoId,
                action: triageAuditActionFilter === "all" ? undefined : triageAuditActionFilter,
                actor: triageAuditActorFilter.trim() || undefined,
                alertCode: triageAuditAlertCodeFilter.trim() || undefined,
                sinceMinutes: authSinceMinutes,
                limit: 8,
                offset: 0,
            }),
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
    const {
        data: integrationIncidentSlaSummaryData,
        isLoading: integrationIncidentSlaSummaryLoading,
        isFetching: integrationIncidentSlaSummaryFetching,
        error: integrationIncidentSlaSummaryError,
        refetch: refetchIntegrationIncidentSlaSummary,
    } = useQuery({
        queryKey: [
            "settings",
            "integration-incident-sla-summary",
            integrationRepoId,
            warningSlaMinutes,
            criticalSlaMinutes,
            authSinceMinutes,
        ],
        queryFn: () =>
            fetchIntegrationIncidentSlaSummary({
                repoId: integrationRepoId,
                windowMinutes: authSinceMinutes,
                warningSlaMinutes,
                criticalSlaMinutes,
            }),
        refetchInterval: 30_000,
    });
    const {
        data: webhookActionAuditsData,
        isLoading: webhookActionAuditsLoading,
        isFetching: webhookActionAuditsFetching,
        error: webhookActionAuditsError,
        refetch: refetchWebhookActionAudits,
    } = useQuery({
        queryKey: ["settings", "integration-webhook-action-audits", integrationRepoId],
        queryFn: () =>
            fetchIntegrationWebhookActionAudits({
                repoId: integrationRepoId,
                limit: 8,
        }),
        refetchInterval: 30_000,
    });
    const {
        data: notificationDeliveriesData,
        isLoading: notificationDeliveriesLoading,
        isFetching: notificationDeliveriesFetching,
        error: notificationDeliveriesError,
        refetch: refetchNotificationDeliveries,
    } = useQuery({
        queryKey: [
            "settings",
            "integration-notification-deliveries",
            integrationRepoId,
            notificationStatusFilter,
        ],
        queryFn: () =>
            fetchIntegrationNotifications({
                repoId: integrationRepoId,
                status: notificationStatusFilter === "all" ? undefined : notificationStatusFilter,
                limit: 8,
                offset: 0,
            }),
        refetchInterval: 30_000,
    });
    const {
        data: notificationActionAuditsData,
        isLoading: notificationActionAuditsLoading,
        isFetching: notificationActionAuditsFetching,
        error: notificationActionAuditsError,
        refetch: refetchNotificationActionAudits,
    } = useQuery({
        queryKey: ["settings", "integration-notification-action-audits", integrationRepoId],
        queryFn: () =>
            fetchIntegrationNotificationActionAudits({
                repoId: integrationRepoId,
                limit: 8,
        }),
        refetchInterval: 30_000,
    });
    const issueLinkProvider = authProvider === "linear" || authProvider === "jira" ? authProvider : undefined;
    const {
        data: issueLinksData,
        isLoading: issueLinksLoading,
        isFetching: issueLinksFetching,
        error: issueLinksError,
        refetch: refetchIssueLinks,
    } = useQuery({
        queryKey: [
            "settings",
            "integration-issue-links",
            integrationRepoId,
            issueLinkProvider,
            issueLinkStatusFilter,
        ],
        queryFn: () =>
            fetchIntegrationIssueLinks({
                repoId: integrationRepoId,
                provider: issueLinkProvider,
                status: issueLinkStatusFilter === "all" ? undefined : issueLinkStatusFilter,
                limit: 8,
                offset: 0,
            }),
        refetchInterval: 30_000,
    });
    const {
        data: issueLinkActionAuditsData,
        isLoading: issueLinkActionAuditsLoading,
        isFetching: issueLinkActionAuditsFetching,
        error: issueLinkActionAuditsError,
        refetch: refetchIssueLinkActionAudits,
    } = useQuery({
        queryKey: ["settings", "integration-issue-link-action-audits", integrationRepoId],
        queryFn: () =>
            fetchIntegrationIssueLinkActionAudits({
                repoId: integrationRepoId,
                limit: 8,
            }),
        refetchInterval: 30_000,
    });

    useEffect(() => {
        if (typeof window === "undefined") return;

        const configuredWsUrl = process.env.NEXT_PUBLIC_WS_URL?.trim();
        const wsUrl = configuredWsUrl
            ? configuredWsUrl
            : (() => {
                  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
                  if (window.location.port === "3000") {
                      return `${protocol}//${window.location.hostname}:3001/ws`;
                  }
                  return `${protocol}//${window.location.host}/ws`;
              })();
        if (!wsUrl) return;

        let socket: WebSocket | null = null;
        let stopped = false;
        let reconnectTimer: number | null = null;

        const refreshIntegrationQueries = () => {
            const now = Date.now();
            if (now - lastRealtimeRefreshAtRef.current < REALTIME_REFRESH_DEBOUNCE_MS) return;
            lastRealtimeRefreshAtRef.current = now;
            void Promise.all([
                refetchIntegrationConnections(),
                refetchConnectionActionAudits(),
                refetchIntegrationMetrics(),
                refetchIntegrationAlerts(),
                refetchIntegrationIncidentTimeline(),
                refetchIntegrationIncidentSlaSummary(),
                refetchTriageAudits(),
                refetchWebhookEvents(),
                refetchWebhookActionAudits(),
                refetchNotificationDeliveries(),
                refetchNotificationActionAudits(),
                refetchIssueLinks(),
                refetchIssueLinkActionAudits(),
            ]);
        };

        const connect = () => {
            if (stopped) return;
            socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                const channels = integrationRepoId ? ["integrations", `repo:${integrationRepoId}`] : ["integrations"];
                socket?.send(
                    JSON.stringify({
                        type: "subscribe",
                        payload: { channels },
                    })
                );
            };

            socket.onmessage = (event) => {
                try {
                    const parsed = JSON.parse(event.data as string) as {
                        type?: string;
                        payload?: { repoId?: string };
                    };
                    if (parsed?.type !== "integration:updated") return;
                    if (
                        integrationRepoId &&
                        typeof parsed?.payload?.repoId === "string" &&
                        parsed.payload.repoId !== integrationRepoId
                    ) {
                        return;
                    }
                    refreshIntegrationQueries();
                } catch {
                    // Ignore malformed WS payloads.
                }
            };

            socket.onclose = () => {
                if (stopped) return;
                reconnectTimer = window.setTimeout(connect, 2000);
            };

            socket.onerror = () => {
                // Network hiccups are expected in local/dev.
            };
        };

        connect();

        return () => {
            stopped = true;
            if (reconnectTimer !== null) {
                window.clearTimeout(reconnectTimer);
            }
            socket?.close();
        };
    }, [
        integrationRepoId,
        refetchConnectionActionAudits,
        refetchIntegrationAlerts,
        refetchIntegrationConnections,
        refetchIntegrationIncidentTimeline,
        refetchIntegrationIncidentSlaSummary,
        refetchIntegrationMetrics,
        refetchIssueLinkActionAudits,
        refetchIssueLinks,
        refetchNotificationActionAudits,
        refetchNotificationDeliveries,
        refetchTriageAudits,
        refetchWebhookActionAudits,
        refetchWebhookEvents,
    ]);

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
    const triageTargetRepoId = integrationRepoId || integrationConnections[0]?.repoId;
    const connectionActionAudits = connectionActionAuditsData?.events || [];
    const incidentTimeline = integrationIncidentTimelineData?.events || [];
    const incidentSlaSummary: IntegrationIncidentSlaSummary | null = integrationIncidentSlaSummaryData || null;
    const triageAudits = triageAuditsData?.events || [];
    const webhookEvents = webhookEventsData?.events || [];
    const webhookActionAudits = webhookActionAuditsData?.events || [];
    const notificationDeliveries = notificationDeliveriesData?.deliveries || [];
    const notificationActionAudits = notificationActionAuditsData?.events || [];
    const issueLinks = issueLinksData?.links || [];
    const issueLinkActionAudits = issueLinkActionAuditsData?.events || [];
    const hasNextAuthPage = authEvents.length === WEBHOOK_DIAGNOSTICS_PAGE_SIZE;
    const integrationLoading =
        integrationConnectionsLoading ||
        connectionActionAuditsLoading ||
        integrationMetricsLoading ||
        integrationAlertsLoading ||
        integrationIncidentTimelineLoading ||
        integrationIncidentSlaSummaryLoading ||
        triageAuditsLoading ||
        webhookEventsLoading ||
        webhookActionAuditsLoading ||
        notificationDeliveriesLoading ||
        notificationActionAuditsLoading ||
        issueLinksLoading ||
        issueLinkActionAuditsLoading;
    const integrationFetching =
        integrationConnectionsFetching ||
        connectionActionAuditsFetching ||
        integrationMetricsFetching ||
        integrationAlertsFetching ||
        integrationIncidentTimelineFetching ||
        integrationIncidentSlaSummaryFetching ||
        triageAuditsFetching ||
        webhookEventsFetching ||
        webhookActionAuditsFetching ||
        notificationDeliveriesFetching ||
        notificationActionAuditsFetching ||
        issueLinksFetching ||
        issueLinkActionAuditsFetching;
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
        setNotificationStatusFilter("all");
        setIssueLinkStatusFilter("all");
        setTimelineScopeFilter("all");
        setTimelineSeverityFilter("all");
        setWarningSlaMinutes(60);
        setCriticalSlaMinutes(30);
        setTriageAuditActionFilter("all");
        setTriageAuditActorFilter("");
        setTriageAuditAlertCodeFilter("");
        setAlertActionMessage("");
        setAlertActionError("");
        setConnectionActionMessage("");
        setConnectionActionError("");
        setWebhookActionMessage("");
        setWebhookActionError("");
        setNotificationActionMessage("");
        setNotificationActionError("");
        setIssueLinkActionMessage("");
        setIssueLinkActionError("");
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

    const onAcknowledgeAlert = async (alertCode: string) => {
        setAlertActionMessage("");
        setAlertActionError("");
        if (!triageTargetRepoId) {
            setAlertActionError("Select or load a repository before alert triage actions.");
            return;
        }
        setProcessingAlertAction({
            code: alertCode,
            mode: "acknowledge",
        });
        try {
            await acknowledgeIntegrationAlert(alertCode, {
                repoId: triageTargetRepoId,
                actor: "settings-ui",
            });
            setAlertActionMessage(`Alert ${alertCode} acknowledged.`);
            await Promise.all([
                refetchIntegrationAlerts(),
                refetchIntegrationIncidentTimeline(),
                refetchIntegrationIncidentSlaSummary(),
                refetchTriageAudits(),
            ]);
        } catch (error) {
            setAlertActionError(getErrorMessage(error, `Failed to acknowledge alert ${alertCode}.`));
        } finally {
            setProcessingAlertAction(null);
        }
    };

    const onMuteAlert = async (alertCode: string) => {
        setAlertActionMessage("");
        setAlertActionError("");
        if (!triageTargetRepoId) {
            setAlertActionError("Select or load a repository before alert triage actions.");
            return;
        }
        setProcessingAlertAction({
            code: alertCode,
            mode: "mute",
        });
        try {
            const result = await muteIntegrationAlert(alertCode, {
                repoId: triageTargetRepoId,
                actor: "settings-ui",
                reason: "Manual mute from settings integration operations panel",
                durationMinutes: 120,
            });
            setAlertActionMessage(`Alert ${alertCode} muted until ${formatAuthTimestamp(result.mutedUntil)}.`);
            await Promise.all([
                refetchIntegrationAlerts(),
                refetchIntegrationIncidentTimeline(),
                refetchIntegrationIncidentSlaSummary(),
                refetchTriageAudits(),
            ]);
        } catch (error) {
            setAlertActionError(getErrorMessage(error, `Failed to mute alert ${alertCode}.`));
        } finally {
            setProcessingAlertAction(null);
        }
    };

    const onUnmuteAlert = async (alertCode: string) => {
        setAlertActionMessage("");
        setAlertActionError("");
        if (!triageTargetRepoId) {
            setAlertActionError("Select or load a repository before alert triage actions.");
            return;
        }
        setProcessingAlertAction({
            code: alertCode,
            mode: "unmute",
        });
        try {
            await unmuteIntegrationAlert(alertCode, {
                repoId: triageTargetRepoId,
                actor: "settings-ui",
                reason: "Manual unmute from settings integration operations panel",
            });
            setAlertActionMessage(`Alert ${alertCode} unmuted.`);
            await Promise.all([
                refetchIntegrationAlerts(),
                refetchIntegrationIncidentTimeline(),
                refetchIntegrationIncidentSlaSummary(),
                refetchTriageAudits(),
            ]);
        } catch (error) {
            setAlertActionError(getErrorMessage(error, `Failed to unmute alert ${alertCode}.`));
        } finally {
            setProcessingAlertAction(null);
        }
    };

    const onBulkTriageAlerts = async (
        action: "acknowledge" | "mute" | "unmute",
        alertCodes: string[]
    ) => {
        setAlertActionMessage("");
        setAlertActionError("");
        if (!triageTargetRepoId) {
            setAlertActionError("Select or load a repository before bulk triage actions.");
            return;
        }
        if (alertCodes.length === 0) {
            setAlertActionError(`No alerts available for bulk ${action}.`);
            return;
        }

        setBulkAlertActionMode(action);
        try {
            const result = await bulkTriageIntegrationAlerts({
                repoId: triageTargetRepoId,
                action,
                alertCodes,
                actor: "settings-ui",
                reason: "Bulk action from settings integration operations panel",
                note: "Bulk action from settings integration operations panel",
                durationMinutes: action === "mute" ? 120 : undefined,
            });
            setAlertActionMessage(
                `Bulk ${action} processed ${result.processed} alert(s): ${result.succeeded} succeeded, ${result.failed} failed.`
            );
            await Promise.all([
                refetchIntegrationAlerts(),
                refetchIntegrationIncidentTimeline(),
                refetchIntegrationIncidentSlaSummary(),
                refetchTriageAudits(),
            ]);
        } catch (error) {
            setAlertActionError(getErrorMessage(error, `Failed to apply bulk ${action} triage.`));
        } finally {
            setBulkAlertActionMode(null);
        }
    };

    const onValidateConnection = async (connection: IntegrationConnection, mode: ConnectionActionMode) => {
        setConnectionActionMessage("");
        setConnectionActionError("");
        setProcessingConnectionAction({
            id: connection.id,
            mode,
        });
        try {
            const result = await validateIntegrationConnection(
                connection.id,
                mode === "fail_validate"
                    ? {
                          simulateFailure: true,
                          errorMessage: "Manual validation failure drill from settings control plane",
                      }
                    : {}
            );
            const message = `Connection ${result.connection.displayName} is now ${result.connection.status}.`;
            setConnectionActionMessage(message);
            await Promise.all([
                refetchIntegrationConnections(),
                refetchIntegrationMetrics(),
                refetchIntegrationAlerts(),
                refetchConnectionActionAudits(),
            ]);
        } catch (error) {
            const message = getErrorMessage(error, "Failed to validate integration connection.");
            setConnectionActionError(message);
        } finally {
            setProcessingConnectionAction(null);
        }
    };

    const onSetConnectionStatus = async (
        connection: IntegrationConnection,
        nextStatus: "active" | "disabled"
    ) => {
        setConnectionActionMessage("");
        setConnectionActionError("");
        setProcessingConnectionAction({
            id: connection.id,
            mode: nextStatus === "active" ? "enable" : "disable",
        });
        try {
            const result = await setIntegrationConnectionStatus(
                connection.id,
                nextStatus,
                nextStatus === "active"
                    ? "Manual enable from settings control plane"
                    : "Manual disable from settings control plane"
            );
            const message = `Connection ${result.connection.displayName} status set to ${result.connection.status}.`;
            setConnectionActionMessage(message);
            await Promise.all([
                refetchIntegrationConnections(),
                refetchIntegrationMetrics(),
                refetchIntegrationAlerts(),
                refetchConnectionActionAudits(),
            ]);
        } catch (error) {
            const message = getErrorMessage(error, "Failed to update integration connection status.");
            setConnectionActionError(message);
        } finally {
            setProcessingConnectionAction(null);
        }
    };

    const onRetryDueWebhooks = async () => {
        setWebhookActionMessage("");
        setWebhookActionError("");
        setRetryingDueWebhooks(true);
        try {
            const result = await retryDueIntegrationWebhooks(20, integrationRepoId);
            const message = `Retried ${result.processed} due webhook event(s).`;
            setWebhookActionMessage(message);
            await Promise.all([
                refetchWebhookEvents(),
                refetchIntegrationMetrics(),
                refetchIntegrationAlerts(),
                refetchWebhookActionAudits(),
            ]);
        } catch (error) {
            const message = getErrorMessage(error, "Failed to retry due webhooks.");
            setWebhookActionError(message);
        } finally {
            setRetryingDueWebhooks(false);
        }
    };

    const onProcessWebhook = async (event: IntegrationWebhookEvent, mode: WebhookActionMode) => {
        setWebhookActionMessage("");
        setWebhookActionError("");
        setProcessingWebhookAction({
            id: event.id,
            mode,
        });
        try {
            const result = await processIntegrationWebhookEvent(
                event.id,
                mode === "fail"
                    ? {
                          simulateFailure: true,
                          errorMessage: "Manual failure drill from settings recovery queue",
                      }
                    : {}
            );
            const message = `Webhook ${result.event.externalEventId} is now ${formatWebhookStatus(result.event.status)}.`;
            setWebhookActionMessage(message);
            await Promise.all([
                refetchWebhookEvents(),
                refetchIntegrationMetrics(),
                refetchIntegrationAlerts(),
                refetchWebhookActionAudits(),
            ]);
        } catch (error) {
            const message = getErrorMessage(error, "Failed to process webhook event.");
            setWebhookActionError(message);
        } finally {
            setProcessingWebhookAction(null);
        }
    };

    const onRetryDueNotifications = async () => {
        setNotificationActionMessage("");
        setNotificationActionError("");
        setRetryingDueNotifications(true);
        try {
            const result = await retryDueIntegrationNotifications(20, integrationRepoId);
            const message = `Retried ${result.processed} due notification(s).`;
            setNotificationActionMessage(message);
            await Promise.all([
                refetchNotificationDeliveries(),
                refetchIntegrationMetrics(),
                refetchIntegrationAlerts(),
                refetchNotificationActionAudits(),
            ]);
        } catch (error) {
            const message = getErrorMessage(error, "Failed to retry due notifications.");
            setNotificationActionError(message);
        } finally {
            setRetryingDueNotifications(false);
        }
    };

    const onProcessNotification = async (delivery: IntegrationNotificationDelivery, mode: NotificationActionMode) => {
        setNotificationActionMessage("");
        setNotificationActionError("");
        setProcessingNotificationAction({
            id: delivery.id,
            mode,
        });
        try {
            const result = await deliverIntegrationNotification(
                delivery.id,
                mode === "fail"
                    ? {
                          simulateFailure: true,
                          errorMessage: "Manual failure drill from settings delivery queue",
                      }
                    : {}
            );
            const message = `Notification ${result.delivery.correlationId} is now ${formatNotificationStatus(result.delivery.status)}.`;
            setNotificationActionMessage(message);
            await Promise.all([
                refetchNotificationDeliveries(),
                refetchIntegrationMetrics(),
                refetchIntegrationAlerts(),
                refetchNotificationActionAudits(),
            ]);
        } catch (error) {
            const message = getErrorMessage(error, "Failed to process notification delivery.");
            setNotificationActionError(message);
        } finally {
            setProcessingNotificationAction(null);
        }
    };

    const onRetryIssueLinkSyncs = async () => {
        setIssueLinkActionMessage("");
        setIssueLinkActionError("");
        setRetryingIssueLinkSyncs(true);
        try {
            const result = await retryIntegrationIssueLinkSyncs(20, integrationRepoId);
            const message = `Retried ${result.processed} issue-link sync(s).`;
            setIssueLinkActionMessage(message);
            await Promise.all([
                refetchIssueLinks(),
                refetchIntegrationMetrics(),
                refetchIntegrationAlerts(),
                refetchIssueLinkActionAudits(),
            ]);
        } catch (error) {
            const message = getErrorMessage(error, "Failed to retry issue-link syncs.");
            setIssueLinkActionError(message);
        } finally {
            setRetryingIssueLinkSyncs(false);
        }
    };

    const onSyncIssueLink = async (link: IntegrationIssueLink, mode: IssueLinkActionMode) => {
        setIssueLinkActionMessage("");
        setIssueLinkActionError("");
        setProcessingIssueLinkAction({
            id: link.id,
            mode,
        });
        try {
            const result = await syncIntegrationIssueLink(
                link.id,
                mode === "fail"
                    ? {
                          simulateFailure: true,
                          errorMessage: "Manual failure drill from settings issue-link queue",
                      }
                    : {}
            );
            const message = `Issue link ${result.issueLink.issueKey} is now ${formatIssueLinkStatus(result.issueLink.status)}.`;
            setIssueLinkActionMessage(message);
            await Promise.all([
                refetchIssueLinks(),
                refetchIntegrationMetrics(),
                refetchIntegrationAlerts(),
                refetchIssueLinkActionAudits(),
            ]);
        } catch (error) {
            const message = getErrorMessage(error, "Failed to sync issue link.");
            setIssueLinkActionError(message);
        } finally {
            setProcessingIssueLinkAction(null);
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
                                refetchConnectionActionAudits(),
                                refetchIntegrationMetrics(),
                                refetchIntegrationAlerts(),
                                refetchWebhookEvents(),
                                refetchWebhookActionAudits(),
                                refetchNotificationDeliveries(),
                                refetchNotificationActionAudits(),
                                refetchIssueLinks(),
                                refetchIssueLinkActionAudits(),
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
                    ) : integrationConnectionsError ||
                      connectionActionAuditsError ||
                      integrationMetricsError ||
                      integrationAlertsError ||
                      integrationIncidentTimelineError ||
                      integrationIncidentSlaSummaryError ||
                      triageAuditsError ? (
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-3 py-2">
                            {[
                                integrationConnectionsError
                                    ? getErrorMessage(integrationConnectionsError, "Connections unavailable")
                                    : null,
                                connectionActionAuditsError
                                    ? getErrorMessage(connectionActionAuditsError, "Connection action audits unavailable")
                                    : null,
                                integrationMetricsError
                                    ? getErrorMessage(integrationMetricsError, "Metrics unavailable")
                                    : null,
                                integrationAlertsError
                                    ? getErrorMessage(integrationAlertsError, "Alerts unavailable")
                                    : null,
                                integrationIncidentTimelineError
                                    ? getErrorMessage(integrationIncidentTimelineError, "Incident timeline unavailable")
                                    : null,
                                integrationIncidentSlaSummaryError
                                    ? getErrorMessage(integrationIncidentSlaSummaryError, "Incident SLA summary unavailable")
                                    : null,
                                triageAuditsError
                                    ? getErrorMessage(triageAuditsError, "Alert triage audit feed unavailable")
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
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h4 className="text-sm font-semibold text-white">Alert Triage</h4>
                                        <p className="text-xs text-zinc-500">
                                            Acknowledge active alerts, apply temporary mute windows, and jump into runbooks.
                                        </p>
                                    </div>
                                    <div className="text-xs text-zinc-500">
                                        {triageTargetRepoId ? `Repo ${triageTargetRepoId}` : "Repo not selected"}
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <button
                                        onClick={() =>
                                            onBulkTriageAlerts(
                                                "acknowledge",
                                                (integrationSnapshot.alerts?.alerts || []).map((alert) => alert.code)
                                            )
                                        }
                                        disabled={!triageTargetRepoId || bulkAlertActionMode !== null}
                                        className="px-2 py-1 rounded border border-zinc-700 text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                                    >
                                        {bulkAlertActionMode === "acknowledge" ? "Acknowledging..." : "Acknowledge All Active"}
                                    </button>
                                    <button
                                        onClick={() =>
                                            onBulkTriageAlerts(
                                                "mute",
                                                (integrationSnapshot.alerts?.alerts || []).map((alert) => alert.code)
                                            )
                                        }
                                        disabled={!triageTargetRepoId || bulkAlertActionMode !== null}
                                        className="px-2 py-1 rounded border border-yellow-800/60 text-yellow-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-yellow-900/30 transition-colors"
                                    >
                                        {bulkAlertActionMode === "mute" ? "Muting..." : "Mute All Active (2h)"}
                                    </button>
                                    <button
                                        onClick={() =>
                                            onBulkTriageAlerts(
                                                "unmute",
                                                (integrationSnapshot.alerts?.mutedAlerts || []).map((alert) => alert.code)
                                            )
                                        }
                                        disabled={!triageTargetRepoId || bulkAlertActionMode !== null}
                                        className="px-2 py-1 rounded border border-green-800/70 text-green-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-900/30 transition-colors"
                                    >
                                        {bulkAlertActionMode === "unmute" ? "Unmuting..." : "Unmute All Muted"}
                                    </button>
                                </div>

                                {integrationSnapshot.alerts?.alerts.length ||
                                (integrationSnapshot.alerts?.mutedAlerts || []).length ? (
                                    <div className="space-y-2">
                                        {(integrationSnapshot.alerts?.alerts || []).map((alert) => {
                                            const isProcessing = processingAlertAction?.code === alert.code;
                                            return (
                                                <div
                                                    key={alert.code}
                                                    data-testid={`integration-alert-${alert.code}`}
                                                    className="rounded border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300 space-y-2"
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span
                                                                className={
                                                                    alert.severity === "critical"
                                                                        ? "text-red-300 font-semibold"
                                                                        : "text-yellow-300 font-semibold"
                                                                }
                                                            >
                                                                {alert.code}
                                                            </span>
                                                            {alert.triage?.acknowledgedAt ? (
                                                                <span className="px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-200">
                                                                    Ack
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                        <div className="text-zinc-500">
                                                            {alert.value} / threshold {alert.threshold}
                                                        </div>
                                                    </div>
                                                    <div className="text-zinc-400">{alert.message}</div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button
                                                            onClick={() => onAcknowledgeAlert(alert.code)}
                                                            disabled={!triageTargetRepoId || isProcessing}
                                                            className="px-2 py-1 rounded border border-zinc-700 text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                                                        >
                                                            {isProcessing && processingAlertAction?.mode === "acknowledge"
                                                                ? "Acknowledging..."
                                                                : "Acknowledge"}
                                                        </button>
                                                        <button
                                                            onClick={() => onMuteAlert(alert.code)}
                                                            disabled={!triageTargetRepoId || isProcessing}
                                                            className="px-2 py-1 rounded border border-yellow-800/60 text-yellow-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-yellow-900/30 transition-colors"
                                                        >
                                                            {isProcessing && processingAlertAction?.mode === "mute"
                                                                ? "Muting..."
                                                                : "Mute 2h"}
                                                        </button>
                                                        {alert.runbookUrl ? (
                                                            <a
                                                                href={alert.runbookUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800/70 transition-colors"
                                                            >
                                                                Open Runbook
                                                            </a>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {(integrationSnapshot.alerts?.mutedAlerts || []).map((alert) => {
                                            const isProcessing = processingAlertAction?.code === alert.code;
                                            return (
                                                <div
                                                    key={`muted-${alert.code}`}
                                                    data-testid={`integration-muted-alert-${alert.code}`}
                                                    className="rounded border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300 space-y-2"
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="text-zinc-200 font-semibold">{alert.code}</span>
                                                            <span className="px-2 py-0.5 rounded bg-zinc-700/40 border border-zinc-700 text-zinc-300">
                                                                Muted
                                                            </span>
                                                        </div>
                                                        <div className="text-zinc-500">
                                                            Until{" "}
                                                            {alert.triage?.mutedUntil
                                                                ? formatAuthTimestamp(alert.triage.mutedUntil)
                                                                : "unknown"}
                                                        </div>
                                                    </div>
                                                    <div className="text-zinc-400">{alert.message}</div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button
                                                            onClick={() => onUnmuteAlert(alert.code)}
                                                            disabled={!triageTargetRepoId || isProcessing}
                                                            className="px-2 py-1 rounded border border-green-800/70 text-green-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-900/30 transition-colors"
                                                        >
                                                            {isProcessing && processingAlertAction?.mode === "unmute"
                                                                ? "Unmuting..."
                                                                : "Unmute"}
                                                        </button>
                                                        {alert.runbookUrl ? (
                                                            <a
                                                                href={alert.runbookUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800/70 transition-colors"
                                                            >
                                                                Open Runbook
                                                            </a>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-sm text-zinc-500">No active or muted integration alerts.</div>
                                )}

                                {alertActionMessage ? (
                                    <div className="text-xs text-green-300 bg-green-500/10 border border-green-500/20 rounded px-3 py-2">
                                        {alertActionMessage}
                                    </div>
                                ) : null}
                                {alertActionError ? (
                                    <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                                        {alertActionError}
                                    </div>
                                ) : null}
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h4 className="text-sm font-semibold text-white">Incident Timeline</h4>
                                        <p className="text-xs text-zinc-500">
                                            Cross-scope integration incidents for triage context and recent history.
                                        </p>
                                    </div>
                                    <div className="text-xs text-zinc-500">
                                        {integrationIncidentTimelineFetching ? "Refreshing..." : "Latest incidents"}
                                    </div>
                                </div>

                                <div className="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-3 space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-xs text-zinc-400">Incident SLA Summary</div>
                                        <div className="text-xs text-zinc-500">
                                            {integrationIncidentSlaSummaryFetching ? "Refreshing..." : "Window: last diagnostics range"}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                                        <label className="space-y-1">
                                            <span className="text-zinc-500">Warning SLA (min)</span>
                                            <input
                                                type="number"
                                                min={0}
                                                max={43200}
                                                value={warningSlaMinutes}
                                                onChange={(e) => setWarningSlaMinutes(Math.max(0, Number(e.target.value) || 0))}
                                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-100"
                                            />
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-zinc-500">Critical SLA (min)</span>
                                            <input
                                                type="number"
                                                min={0}
                                                max={43200}
                                                value={criticalSlaMinutes}
                                                onChange={(e) => setCriticalSlaMinutes(Math.max(0, Number(e.target.value) || 0))}
                                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-100"
                                            />
                                        </label>
                                        <div className="md:col-span-2 grid grid-cols-3 gap-2">
                                            <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-2">
                                                <div className="text-zinc-500">Active</div>
                                                <div className="text-zinc-100 font-medium">
                                                    {incidentSlaSummary?.totals.activeAlerts ?? 0}
                                                </div>
                                            </div>
                                            <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-2">
                                                <div className="text-zinc-500">Muted</div>
                                                <div className="text-zinc-100 font-medium">
                                                    {incidentSlaSummary?.totals.mutedAlerts ?? 0}
                                                </div>
                                            </div>
                                            <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-2">
                                                <div className="text-zinc-500">Breaches</div>
                                                <div className="text-zinc-100 font-medium">
                                                    {incidentSlaSummary?.totals.breaches ?? 0}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {integrationIncidentSlaSummaryLoading ? (
                                        <div className="text-xs text-zinc-500">Loading SLA summary...</div>
                                    ) : (
                                        <div className="text-xs text-zinc-400">
                                            {(incidentSlaSummary?.breaches || []).slice(0, 2).map((breach) => breach.code).join(", ") ||
                                                "No SLA breaches in window."}
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                                    <select
                                        value={timelineScopeFilter}
                                        onChange={(e) =>
                                            setTimelineScopeFilter(
                                                e.target.value as
                                                    | "all"
                                                    | "alert_triage"
                                                    | "webhook_auth"
                                                    | "webhook_processing"
                                                    | "notification_delivery"
                                                    | "issue_sync"
                                            )
                                        }
                                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-100"
                                    >
                                        <option value="all">All scopes</option>
                                        <option value="alert_triage">Alert triage</option>
                                        <option value="webhook_auth">Webhook auth</option>
                                        <option value="webhook_processing">Webhook processing</option>
                                        <option value="notification_delivery">Notification delivery</option>
                                        <option value="issue_sync">Issue sync</option>
                                    </select>
                                    <select
                                        value={timelineSeverityFilter}
                                        onChange={(e) => setTimelineSeverityFilter(e.target.value as "all" | "warning" | "critical")}
                                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-100"
                                    >
                                        <option value="all">All severities</option>
                                        <option value="critical">Critical</option>
                                        <option value="warning">Warning</option>
                                    </select>
                                    <div className="text-zinc-500 md:col-span-2 flex items-center">
                                        {integrationIncidentTimelineData?.total ?? 0} timeline event(s)
                                    </div>
                                </div>

                                {integrationIncidentTimelineLoading ? (
                                    <div className="text-sm text-zinc-500">Loading incident timeline...</div>
                                ) : incidentTimeline.length === 0 ? (
                                    <div className="text-sm text-zinc-500">No incidents match the current filters.</div>
                                ) : (
                                    <div className="space-y-2" data-testid="settings-incident-timeline">
                                        {incidentTimeline.slice(0, 8).map((entry: IntegrationIncidentTimelineEntry) => (
                                            <div
                                                key={entry.id}
                                                className="rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-300"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="font-medium text-zinc-100 truncate">{entry.title}</div>
                                                    <span
                                                        className={
                                                            entry.severity === "critical" ? "text-red-300" : "text-yellow-300"
                                                        }
                                                    >
                                                        {entry.severity}
                                                    </span>
                                                </div>
                                                <div className="text-zinc-400">
                                                    {formatIncidentScope(entry.scope)} | {formatAuthTimestamp(entry.timestamp)}
                                                    {entry.actor ? ` | ${entry.actor}` : ""}
                                                </div>
                                                <div className="text-zinc-400">{entry.summary}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h4 className="text-sm font-semibold text-white">Alert Triage Audit Feed</h4>
                                        <p className="text-xs text-zinc-500">
                                            Persisted triage history with actor attribution and action filters.
                                        </p>
                                    </div>
                                    <div className="text-xs text-zinc-500">
                                        {triageAuditsFetching ? "Refreshing..." : `${triageAuditsData?.total ?? 0} event(s)`}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                                    <select
                                        value={triageAuditActionFilter}
                                        onChange={(e) =>
                                            setTriageAuditActionFilter(
                                                e.target.value as "all" | "acknowledge" | "mute" | "unmute"
                                            )
                                        }
                                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-100"
                                    >
                                        <option value="all">All actions</option>
                                        <option value="acknowledge">Acknowledge</option>
                                        <option value="mute">Mute</option>
                                        <option value="unmute">Unmute</option>
                                    </select>
                                    <input
                                        value={triageAuditActorFilter}
                                        onChange={(e) => setTriageAuditActorFilter(e.target.value)}
                                        placeholder="actor (e.g. settings-ui)"
                                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-100 placeholder:text-zinc-500"
                                    />
                                    <input
                                        value={triageAuditAlertCodeFilter}
                                        onChange={(e) => setTriageAuditAlertCodeFilter(e.target.value)}
                                        placeholder="alert code (e.g. webhook_auth_failures_high)"
                                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-100 placeholder:text-zinc-500"
                                    />
                                </div>

                                {triageAuditsLoading ? (
                                    <div className="text-sm text-zinc-500">Loading triage audits...</div>
                                ) : triageAudits.length === 0 ? (
                                    <div className="text-sm text-zinc-500">No triage audits found for the selected filters.</div>
                                ) : (
                                    <div className="space-y-2" data-testid="settings-alert-triage-audits">
                                        {triageAudits.map((event: IntegrationAlertTriageAuditEvent) => (
                                            <div
                                                key={event.id}
                                                className="rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-300"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-medium text-zinc-100">
                                                        {formatAlertTriageAction(event.action)}
                                                    </span>
                                                    <span className="text-zinc-500">{formatAuthTimestamp(event.createdAt)}</span>
                                                </div>
                                                <div className="text-zinc-400">
                                                    Alert: {event.alertCode || "unknown"} | Actor: {event.actor || "system"}
                                                </div>
                                                <div className="text-zinc-400">{event.summary || "No summary"}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div
                                className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 space-y-3"
                                data-testid="settings-connection-control-plane"
                            >
                                <div>
                                    <h4 className="text-sm font-semibold text-white">Connection Control Plane</h4>
                                    <p className="text-xs text-zinc-500">
                                        Manually validate connections and toggle provider status with persisted operator audits.
                                    </p>
                                </div>

                                {integrationConnections.length === 0 ? (
                                    <div className="text-sm text-zinc-500">No configured integration connections.</div>
                                ) : (
                                    <div className="rounded border border-zinc-800 overflow-x-auto">
                                        <div className="min-w-[980px]">
                                            <div className="grid grid-cols-[110px_170px_110px_170px_1fr_280px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 bg-zinc-950/60">
                                                <span>Provider</span>
                                                <span>Connection</span>
                                                <span>Status</span>
                                                <span>Last Validated</span>
                                                <span>Last Error</span>
                                                <span>Actions</span>
                                            </div>
                                            <div className="divide-y divide-zinc-800">
                                                {integrationConnections.map((connection) => {
                                                    const isProcessing = processingConnectionAction?.id === connection.id;
                                                    return (
                                                        <div
                                                            key={connection.id}
                                                            data-testid={`connection-row-${connection.id}`}
                                                            className="grid grid-cols-[110px_170px_110px_170px_1fr_280px] gap-2 px-3 py-2 text-sm text-zinc-200 items-center"
                                                        >
                                                            <span className="capitalize">{connection.provider}</span>
                                                            <div className="min-w-0">
                                                                <div className="truncate">{connection.displayName}</div>
                                                                <div className="text-xs text-zinc-500 truncate">{connection.id}</div>
                                                            </div>
                                                            <span
                                                                className={
                                                                    connection.status === "active"
                                                                        ? "text-green-300"
                                                                        : connection.status === "disabled"
                                                                          ? "text-zinc-300"
                                                                          : "text-red-300"
                                                                }
                                                            >
                                                                {connection.status}
                                                            </span>
                                                            <span className="text-xs text-zinc-400">
                                                                {connection.lastValidatedAt
                                                                    ? formatAuthTimestamp(connection.lastValidatedAt)
                                                                    : "Never"}
                                                            </span>
                                                            <span className="text-xs text-zinc-400 truncate">
                                                                {connection.lastError || "None"}
                                                            </span>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => onValidateConnection(connection, "validate")}
                                                                    disabled={isProcessing}
                                                                    className="px-2 py-1 rounded border border-zinc-700 text-xs text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                                                                >
                                                                    {isProcessing && processingConnectionAction?.mode === "validate"
                                                                        ? "Validating..."
                                                                        : "Validate"}
                                                                </button>
                                                                <button
                                                                    onClick={() => onValidateConnection(connection, "fail_validate")}
                                                                    disabled={isProcessing}
                                                                    className="px-2 py-1 rounded border border-red-800/60 text-xs text-red-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-900/40 transition-colors"
                                                                >
                                                                    {isProcessing && processingConnectionAction?.mode === "fail_validate"
                                                                        ? "Failing..."
                                                                        : "Fail Validate"}
                                                                </button>
                                                                <button
                                                                    onClick={() => onSetConnectionStatus(connection, "active")}
                                                                    disabled={isProcessing || connection.status === "active"}
                                                                    className="px-2 py-1 rounded border border-green-800/70 text-xs text-green-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-900/30 transition-colors"
                                                                >
                                                                    {isProcessing && processingConnectionAction?.mode === "enable"
                                                                        ? "Enabling..."
                                                                        : "Enable"}
                                                                </button>
                                                                <button
                                                                    onClick={() => onSetConnectionStatus(connection, "disabled")}
                                                                    disabled={isProcessing || connection.status === "disabled"}
                                                                    className="px-2 py-1 rounded border border-zinc-700 text-xs text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                                                                >
                                                                    {isProcessing && processingConnectionAction?.mode === "disable"
                                                                        ? "Disabling..."
                                                                        : "Disable"}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {connectionActionMessage ? (
                                    <div className="text-xs text-green-300 bg-green-500/10 border border-green-500/20 rounded px-3 py-2">
                                        {connectionActionMessage}
                                    </div>
                                ) : null}
                                {connectionActionError ? (
                                    <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                                        {connectionActionError}
                                    </div>
                                ) : null}
                                {connectionActionAuditsLoading ? (
                                    <div className="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-500">
                                        Loading persisted action audit...
                                    </div>
                                ) : connectionActionAuditsError ? (
                                    <div className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                        Failed to load action audit: {getErrorMessage(connectionActionAuditsError, "Unavailable")}
                                    </div>
                                ) : connectionActionAudits.length > 0 ? (
                                    <div className="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2 space-y-1">
                                        <div className="text-[11px] uppercase tracking-wide text-zinc-500">Recent Actions</div>
                                        {connectionActionAudits.map((entry: IntegrationConnectionActionAuditEvent) => (
                                            <div
                                                key={entry.id}
                                                className={`text-xs ${
                                                    entry.outcome === "success" ? "text-zinc-300" : "text-red-300"
                                                }`}
                                            >
                                                {formatAuthTimestamp(entry.createdAt)} - {entry.summary}
                                                <span className="text-zinc-500"> ({formatConnectionAuditAction(entry.action)})</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
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
                                            <div className="grid grid-cols-[90px_140px_1fr_110px_120px_170px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 bg-zinc-950/60">
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
                                                            className="grid grid-cols-[90px_140px_1fr_110px_120px_170px] gap-2 px-3 py-2 text-sm text-zinc-200 items-center"
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
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => onProcessWebhook(event, "process")}
                                                                    disabled={!actionable || processingWebhookAction?.id === event.id}
                                                                    className="px-2 py-1 rounded border border-zinc-700 text-xs text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                                                                >
                                                                    {processingWebhookAction?.id === event.id &&
                                                                    processingWebhookAction.mode === "process"
                                                                        ? "Processing..."
                                                                        : "Process"}
                                                                </button>
                                                                <button
                                                                    onClick={() => onProcessWebhook(event, "fail")}
                                                                    disabled={!actionable || processingWebhookAction?.id === event.id}
                                                                    className="px-2 py-1 rounded border border-red-800/60 text-xs text-red-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-900/40 transition-colors"
                                                                >
                                                                    {processingWebhookAction?.id === event.id &&
                                                                    processingWebhookAction.mode === "fail"
                                                                        ? "Failing..."
                                                                        : "Fail"}
                                                                </button>
                                                            </div>
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
                                {webhookActionAuditsLoading ? (
                                    <div className="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-500">
                                        Loading persisted action audit...
                                    </div>
                                ) : webhookActionAuditsError ? (
                                    <div className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                        Failed to load action audit: {getErrorMessage(webhookActionAuditsError, "Unavailable")}
                                    </div>
                                ) : webhookActionAudits.length > 0 ? (
                                    <div className="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2 space-y-1">
                                        <div className="text-[11px] uppercase tracking-wide text-zinc-500">Recent Actions</div>
                                        {webhookActionAudits.map((entry: IntegrationWebhookActionAuditEvent) => (
                                            <div
                                                key={entry.id}
                                                className={`text-xs ${
                                                    entry.outcome === "success" ? "text-zinc-300" : "text-red-300"
                                                }`}
                                            >
                                                {formatAuthTimestamp(entry.createdAt)} - {entry.summary}
                                                <span className="text-zinc-500"> ({formatWebhookAuditAction(entry.action)})</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}

                                <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h4 className="text-sm font-semibold text-white">Notification Delivery Queue</h4>
                                            <p className="text-xs text-zinc-500">
                                                Trigger delivery retries and failure drills for pending provider deliveries.
                                            </p>
                                        </div>
                                        <button
                                            onClick={onRetryDueNotifications}
                                            disabled={retryingDueNotifications}
                                            className="px-3 py-1.5 rounded border border-zinc-700 text-xs text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                                        >
                                            {retryingDueNotifications ? "Retrying..." : "Retry Due"}
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs">
                                        <label className="text-zinc-500">Status</label>
                                        <select
                                            value={notificationStatusFilter}
                                            onChange={(e) => setNotificationStatusFilter(e.target.value as NotificationStatusFilter)}
                                            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
                                        >
                                            <option value="all">All</option>
                                            <option value="pending">Pending</option>
                                            <option value="retrying">Retrying</option>
                                            <option value="failed">Failed</option>
                                            <option value="delivered">Delivered</option>
                                            <option value="dead_letter">Dead Letter</option>
                                        </select>
                                    </div>

                                    {notificationDeliveriesLoading ? (
                                        <div className="text-sm text-zinc-400">Loading notification deliveries...</div>
                                    ) : notificationDeliveriesError ? (
                                        <div className="rounded bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-3 py-2">
                                            Failed to load notification deliveries:{" "}
                                            {getErrorMessage(notificationDeliveriesError, "Unavailable")}
                                        </div>
                                    ) : notificationDeliveries.length === 0 ? (
                                        <div className="text-sm text-zinc-500">No notification deliveries for selected filters.</div>
                                    ) : (
                                        <div className="rounded border border-zinc-800 overflow-x-auto">
                                            <div className="min-w-[920px]">
                                                <div className="grid grid-cols-[120px_140px_1fr_110px_120px_190px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 bg-zinc-950/60">
                                                    <span>Status</span>
                                                    <span>Channel</span>
                                                    <span>Event</span>
                                                    <span>Attempts</span>
                                                    <span>Created</span>
                                                    <span>Action</span>
                                                </div>
                                                <div className="divide-y divide-zinc-800">
                                                    {notificationDeliveries.map((delivery) => {
                                                        const actionable =
                                                            delivery.status === "pending" ||
                                                            delivery.status === "retrying" ||
                                                            delivery.status === "failed";
                                                        return (
                                                            <div
                                                                key={delivery.id}
                                                                className="grid grid-cols-[120px_140px_1fr_110px_120px_190px] gap-2 px-3 py-2 text-sm text-zinc-200 items-center"
                                                            >
                                                                <span
                                                                    className={
                                                                        delivery.status === "failed" ||
                                                                        delivery.status === "dead_letter"
                                                                            ? "text-red-300"
                                                                            : delivery.status === "delivered"
                                                                              ? "text-green-300"
                                                                              : "text-yellow-300"
                                                                    }
                                                                >
                                                                    {formatNotificationStatus(delivery.status)}
                                                                </span>
                                                                <span className="truncate">{delivery.channel}</span>
                                                                <div className="min-w-0">
                                                                    <div className="truncate">{delivery.eventType}</div>
                                                                    <div className="text-xs text-zinc-500 truncate">
                                                                        {delivery.correlationId}
                                                                    </div>
                                                                </div>
                                                                <span>
                                                                    {delivery.attempts}/{delivery.maxAttempts}
                                                                </span>
                                                                <span className="text-xs text-zinc-400">
                                                                    {formatAuthTimestamp(delivery.createdAt)}
                                                                </span>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => onProcessNotification(delivery, "deliver")}
                                                                        disabled={
                                                                            !actionable ||
                                                                            processingNotificationAction?.id === delivery.id
                                                                        }
                                                                        className="px-2 py-1 rounded border border-zinc-700 text-xs text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                                                                    >
                                                                        {processingNotificationAction?.id === delivery.id &&
                                                                        processingNotificationAction.mode === "deliver"
                                                                            ? "Delivering..."
                                                                            : "Deliver"}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => onProcessNotification(delivery, "fail")}
                                                                        disabled={
                                                                            !actionable ||
                                                                            processingNotificationAction?.id === delivery.id
                                                                        }
                                                                        className="px-2 py-1 rounded border border-red-800/60 text-xs text-red-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-900/40 transition-colors"
                                                                    >
                                                                        {processingNotificationAction?.id === delivery.id &&
                                                                        processingNotificationAction.mode === "fail"
                                                                            ? "Failing..."
                                                                            : "Fail"}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {notificationActionMessage ? (
                                        <div className="text-xs text-green-300 bg-green-500/10 border border-green-500/20 rounded px-3 py-2">
                                            {notificationActionMessage}
                                        </div>
                                    ) : null}
                                    {notificationActionError ? (
                                        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                                            {notificationActionError}
                                        </div>
                                    ) : null}
                                    {notificationActionAuditsLoading ? (
                                        <div className="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-500">
                                            Loading persisted action audit...
                                        </div>
                                    ) : notificationActionAuditsError ? (
                                        <div className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                            Failed to load action audit:{" "}
                                            {getErrorMessage(notificationActionAuditsError, "Unavailable")}
                                        </div>
                                    ) : notificationActionAudits.length > 0 ? (
                                        <div className="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2 space-y-1">
                                            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Recent Actions</div>
                                            {notificationActionAudits.map((entry: IntegrationNotificationActionAuditEvent) => (
                                                <div
                                                    key={entry.id}
                                                    className={`text-xs ${
                                                        entry.outcome === "success" ? "text-zinc-300" : "text-red-300"
                                                    }`}
                                                >
                                                    {formatAuthTimestamp(entry.createdAt)} - {entry.summary}
                                                    <span className="text-zinc-500">
                                                        {" "}
                                                        ({formatNotificationAuditAction(entry.action)})
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>

                                <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h4 className="text-sm font-semibold text-white">Issue-Link Sync Queue</h4>
                                            <p className="text-xs text-zinc-500">
                                                Trigger Linear/Jira issue-link sync retries and failure drills.
                                            </p>
                                        </div>
                                        <button
                                            onClick={onRetryIssueLinkSyncs}
                                            disabled={retryingIssueLinkSyncs}
                                            className="px-3 py-1.5 rounded border border-zinc-700 text-xs text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                                        >
                                            {retryingIssueLinkSyncs ? "Retrying..." : "Retry Due"}
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs">
                                        <label className="text-zinc-500">Status</label>
                                        <select
                                            value={issueLinkStatusFilter}
                                            onChange={(e) => setIssueLinkStatusFilter(e.target.value as IssueLinkStatusFilter)}
                                            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
                                        >
                                            <option value="all">All</option>
                                            <option value="sync_pending">Sync Pending</option>
                                            <option value="sync_failed">Sync Failed</option>
                                            <option value="linked">Linked</option>
                                        </select>
                                    </div>

                                    {issueLinksLoading ? (
                                        <div className="text-sm text-zinc-400">Loading issue links...</div>
                                    ) : issueLinksError ? (
                                        <div className="rounded bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-3 py-2">
                                            Failed to load issue links: {getErrorMessage(issueLinksError, "Unavailable")}
                                        </div>
                                    ) : issueLinks.length === 0 ? (
                                        <div className="text-sm text-zinc-500">No issue links for selected filters.</div>
                                    ) : (
                                        <div className="rounded border border-zinc-800 overflow-x-auto">
                                            <div className="min-w-[900px]">
                                                <div className="grid grid-cols-[120px_140px_1fr_120px_190px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 bg-zinc-950/60">
                                                    <span>Provider</span>
                                                    <span>Status</span>
                                                    <span>Issue</span>
                                                    <span>Updated</span>
                                                    <span>Action</span>
                                                </div>
                                                <div className="divide-y divide-zinc-800">
                                                    {issueLinks.map((link) => {
                                                        const actionable = link.status === "sync_pending" || link.status === "sync_failed";
                                                        return (
                                                            <div
                                                                key={link.id}
                                                                className="grid grid-cols-[120px_140px_1fr_120px_190px] gap-2 px-3 py-2 text-sm text-zinc-200 items-center"
                                                            >
                                                                <span className="capitalize">{link.provider}</span>
                                                                <span
                                                                    className={
                                                                        link.status === "sync_failed"
                                                                            ? "text-red-300"
                                                                            : link.status === "linked"
                                                                              ? "text-green-300"
                                                                              : "text-yellow-300"
                                                                    }
                                                                >
                                                                    {formatIssueLinkStatus(link.status)}
                                                                </span>
                                                                <div className="min-w-0">
                                                                    <div className="truncate">{link.issueKey}</div>
                                                                    <div className="text-xs text-zinc-500 truncate">{link.prId}</div>
                                                                </div>
                                                                <span className="text-xs text-zinc-400">
                                                                    {formatAuthTimestamp(link.updatedAt)}
                                                                </span>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => onSyncIssueLink(link, "sync")}
                                                                        disabled={!actionable || processingIssueLinkAction?.id === link.id}
                                                                        className="px-2 py-1 rounded border border-zinc-700 text-xs text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800/70 transition-colors"
                                                                    >
                                                                        {processingIssueLinkAction?.id === link.id &&
                                                                        processingIssueLinkAction.mode === "sync"
                                                                            ? "Syncing..."
                                                                            : "Sync"}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => onSyncIssueLink(link, "fail")}
                                                                        disabled={!actionable || processingIssueLinkAction?.id === link.id}
                                                                        className="px-2 py-1 rounded border border-red-800/60 text-xs text-red-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-900/40 transition-colors"
                                                                    >
                                                                        {processingIssueLinkAction?.id === link.id &&
                                                                        processingIssueLinkAction.mode === "fail"
                                                                            ? "Failing..."
                                                                            : "Fail"}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {issueLinkActionMessage ? (
                                        <div className="text-xs text-green-300 bg-green-500/10 border border-green-500/20 rounded px-3 py-2">
                                            {issueLinkActionMessage}
                                        </div>
                                    ) : null}
                                    {issueLinkActionError ? (
                                        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                                            {issueLinkActionError}
                                        </div>
                                    ) : null}
                                    {issueLinkActionAuditsLoading ? (
                                        <div className="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-500">
                                            Loading persisted action audit...
                                        </div>
                                    ) : issueLinkActionAuditsError ? (
                                        <div className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                            Failed to load action audit: {getErrorMessage(issueLinkActionAuditsError, "Unavailable")}
                                        </div>
                                    ) : issueLinkActionAudits.length > 0 ? (
                                        <div className="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2 space-y-1">
                                            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Recent Actions</div>
                                            {issueLinkActionAudits.map((entry: IntegrationIssueLinkActionAuditEvent) => (
                                                <div
                                                    key={entry.id}
                                                    className={`text-xs ${
                                                        entry.outcome === "success" ? "text-zinc-300" : "text-red-300"
                                                    }`}
                                                >
                                                    {formatAuthTimestamp(entry.createdAt)} - {entry.summary}
                                                    <span className="text-zinc-500"> ({formatIssueLinkAuditAction(entry.action)})</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
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

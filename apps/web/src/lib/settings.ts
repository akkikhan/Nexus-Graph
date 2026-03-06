export type SettingValue = string | number | boolean;
export type AppSettings = Record<string, SettingValue>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
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

function isSettingValue(value: unknown): value is SettingValue {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

export function mergeAppSettings(input?: Record<string, unknown> | null): AppSettings {
    const merged: AppSettings = { ...DEFAULT_APP_SETTINGS };
    if (!input) return merged;

    for (const [key, defaultValue] of Object.entries(DEFAULT_APP_SETTINGS)) {
        const candidate = input[key];
        if (!isSettingValue(candidate)) continue;
        if (typeof candidate !== typeof defaultValue) continue;
        merged[key] = candidate;
    }

    return merged;
}

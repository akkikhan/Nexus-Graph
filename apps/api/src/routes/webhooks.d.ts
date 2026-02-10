/**
 * NEXUS API - Webhook Routes
 * Handle incoming webhooks from GitHub, GitLab, etc.
 */
import { Hono } from "hono";
declare const webhookRouter: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
export { webhookRouter };
//# sourceMappingURL=webhooks.d.ts.map
/**
 * NEXUS API Server - Main Entry Point (Updated with WebSocket)
 * Code Intelligence Platform Backend
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { timing } from "hono/timing";
// Import routes
import { authRouter } from "./routes/auth.js";
import { prRouter } from "./routes/pr.js";
import { stackRouter } from "./routes/stack.js";
import { reviewRouter } from "./routes/review.js";
import { aiRouter } from "./routes/ai.js";
import { insightsRouter } from "./routes/insights.js";
import { webhookRouter } from "./routes/webhooks.js";
// Import realtime
import { initRealtimeServer, getRealtimeServer } from "./realtime/websocket.js";
// Import database
import { checkDatabaseHealth } from "./db/index.js";
// Create main app
const app = new Hono();
// Middleware
app.use("*", logger());
app.use("*", timing());
app.use("*", prettyJSON());
app.use("*", cors({
    origin: ["http://localhost:3000", "https://app.nexus.dev"],
    credentials: true,
}));
// Health check with database status
app.get("/health", async (c) => {
    const dbHealth = await checkDatabaseHealth();
    const wsStats = getRealtimeServer()?.getStats();
    return c.json({
        status: dbHealth.connected ? "healthy" : "degraded",
        version: "0.1.0",
        timestamp: new Date().toISOString(),
        database: {
            connected: dbHealth.connected,
            latencyMs: dbHealth.latencyMs,
            error: dbHealth.error,
        },
        websocket: wsStats || { status: "not_initialized" },
    });
});
// API versioning
const v1 = new Hono();
// Mount routers
v1.route("/auth", authRouter);
v1.route("/prs", prRouter);
v1.route("/stacks", stackRouter);
v1.route("/reviews", reviewRouter);
v1.route("/ai", aiRouter);
v1.route("/insights", insightsRouter);
v1.route("/webhooks", webhookRouter);
// Mount v1 API
app.route("/api/v1", v1);
// 404 handler
app.notFound((c) => {
    return c.json({ error: "Not Found", path: c.req.path }, 404);
});
// Error handler
app.onError((err, c) => {
    console.error("API Error:", err);
    return c.json({
        error: err.message || "Internal Server Error",
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    }, 500);
});
// Start server
const port = parseInt(process.env.PORT || "3001", 10);
console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗             ║
║   ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝             ║
║   ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗             ║
║   ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║             ║
║   ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║             ║
║   ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝             ║
║                                                           ║
║   Code Intelligence Platform - API Server                 ║
║   Version: 0.1.0                                          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

🚀 Server running at http://localhost:${port}
📡 API available at http://localhost:${port}/api/v1
🔌 WebSocket available at ws://localhost:${port}/ws
`);
// Create HTTP server
const server = serve({
    fetch: app.fetch,
    port,
});
// Initialize WebSocket server on top of HTTP server
initRealtimeServer(server);
export default app;
//# sourceMappingURL=index.js.map
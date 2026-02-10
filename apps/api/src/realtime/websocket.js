/**
 * NEXUS WebSocket Server
 * Real-time updates for dashboard and clients
 */
import { WebSocketServer, WebSocket } from "ws";
export class RealtimeServer {
    wss;
    clients = new Map();
    heartbeatInterval = null;
    constructor(server) {
        this.wss = new WebSocketServer({
            server,
            path: "/ws",
        });
        this.setupEventHandlers();
        this.startHeartbeat();
        console.log("[WebSocket] Real-time server initialized");
    }
    setupEventHandlers() {
        this.wss.on("connection", (ws, req) => {
            const clientId = this.generateClientId();
            const remoteAddress = req.socket.remoteAddress ?? "unknown";
            const client = {
                ws,
                subscriptions: new Set(["global"]),
                lastPing: Date.now(),
            };
            this.clients.set(clientId, client);
            console.log(`[WebSocket] Client connected: ${clientId} (${remoteAddress})`);
            // Send welcome message
            this.sendTo(ws, {
                type: "connected",
                channel: "system",
                payload: { clientId },
                timestamp: Date.now(),
            });
            ws.on("message", (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(clientId, message);
                }
                catch (err) {
                    console.error("[WebSocket] Invalid message:", err);
                }
            });
            ws.on("close", () => {
                this.clients.delete(clientId);
                console.log(`[WebSocket] Client disconnected: ${clientId}`);
            });
            ws.on("pong", () => {
                const c = this.clients.get(clientId);
                if (c)
                    c.lastPing = Date.now();
            });
        });
    }
    handleMessage(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        switch (message.type) {
            case "subscribe":
                // Subscribe to channels (e.g., "pr:123", "repo:456", "user:789")
                if (Array.isArray(message.payload.channels)) {
                    message.payload.channels.forEach((ch) => {
                        client.subscriptions.add(ch);
                    });
                    this.sendTo(client.ws, {
                        type: "subscribed",
                        channel: "system",
                        payload: { channels: Array.from(client.subscriptions) },
                        timestamp: Date.now(),
                    });
                }
                break;
            case "unsubscribe":
                if (Array.isArray(message.payload.channels)) {
                    message.payload.channels.forEach((ch) => {
                        client.subscriptions.delete(ch);
                    });
                }
                break;
            case "authenticate":
                // Set user ID for the client
                client.userId = message.payload.userId;
                client.subscriptions.add(`user:${message.payload.userId}`);
                break;
            case "ping":
                this.sendTo(client.ws, {
                    type: "pong",
                    channel: "system",
                    payload: {},
                    timestamp: Date.now(),
                });
                break;
            default:
                console.log(`[WebSocket] Unknown message type: ${message.type}`);
        }
    }
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            const timeout = 60000; // 60 seconds
            this.clients.forEach((client, clientId) => {
                if (now - client.lastPing > timeout) {
                    console.log(`[WebSocket] Client timed out: ${clientId}`);
                    client.ws.terminate();
                    this.clients.delete(clientId);
                }
                else {
                    client.ws.ping();
                }
            });
        }, 30000); // Check every 30 seconds
    }
    generateClientId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    sendTo(ws, event) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(event));
        }
    }
    /**
     * Broadcast an event to all clients subscribed to the channel
     */
    broadcast(type, channel, payload) {
        const event = {
            type,
            channel,
            payload,
            timestamp: Date.now(),
        };
        this.clients.forEach((client) => {
            if (client.subscriptions.has(channel) ||
                client.subscriptions.has("global")) {
                this.sendTo(client.ws, event);
            }
        });
        console.log(`[WebSocket] Broadcast ${type} to ${channel}: ${this.clients.size} potential clients`);
    }
    /**
     * Send event to a specific user
     */
    sendToUser(userId, type, payload) {
        const event = {
            type,
            channel: `user:${userId}`,
            payload,
            timestamp: Date.now(),
        };
        this.clients.forEach((client) => {
            if (client.userId === userId) {
                this.sendTo(client.ws, event);
            }
        });
    }
    /**
     * Broadcast PR updates
     */
    notifyPRUpdate(prId, repoId, type, data) {
        this.broadcast(`pr:${type}`, `pr:${prId}`, data);
        this.broadcast(`pr:${type}`, `repo:${repoId}`, data);
    }
    /**
     * Broadcast AI review progress
     */
    notifyAIProgress(prId, stage, data) {
        this.broadcast(`ai:review_${stage}`, `pr:${prId}`, data);
    }
    /**
     * Broadcast stack updates
     */
    notifyStackUpdate(stackId, userId, data) {
        this.broadcast("stack:updated", `stack:${stackId}`, data);
        this.sendToUser(userId, "stack:updated", data);
    }
    /**
     * Broadcast conflict detection
     */
    notifyConflictDetected(prIds, repoId, data) {
        this.broadcast("conflict:detected", `repo:${repoId}`, data);
        prIds.forEach((prId) => {
            this.broadcast("conflict:detected", `pr:${prId}`, data);
        });
    }
    /**
     * Get connection stats
     */
    getStats() {
        return {
            totalConnections: this.clients.size,
            authenticatedConnections: Array.from(this.clients.values()).filter((c) => c.userId).length,
            subscriptionCounts: this.getSubscriptionCounts(),
        };
    }
    getSubscriptionCounts() {
        const counts = {};
        this.clients.forEach((client) => {
            client.subscriptions.forEach((sub) => {
                counts[sub] = (counts[sub] || 0) + 1;
            });
        });
        return counts;
    }
    /**
     * Graceful shutdown
     */
    close() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.clients.forEach((client) => {
            client.ws.close(1000, "Server shutting down");
        });
        this.wss.close();
        console.log("[WebSocket] Server closed");
    }
}
// Singleton instance
let realtimeServer = null;
export function initRealtimeServer(server) {
    if (!realtimeServer) {
        realtimeServer = new RealtimeServer(server);
    }
    return realtimeServer;
}
export function getRealtimeServer() {
    return realtimeServer;
}
//# sourceMappingURL=websocket.js.map
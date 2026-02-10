/**
 * NEXUS WebSocket Server
 * Real-time updates for dashboard and clients
 */
import type { Server } from "http";
export type WSEventType = "pr:created" | "pr:updated" | "pr:merged" | "pr:review_added" | "stack:updated" | "stack:synced" | "ai:review_started" | "ai:review_completed" | "ai:suggestion" | "notification" | "conflict:detected" | "health:updated" | "velocity:updated";
export declare class RealtimeServer {
    private wss;
    private clients;
    private heartbeatInterval;
    constructor(server?: Server);
    private setupEventHandlers;
    private handleMessage;
    private startHeartbeat;
    private generateClientId;
    private sendTo;
    /**
     * Broadcast an event to all clients subscribed to the channel
     */
    broadcast(type: WSEventType, channel: string, payload: any): void;
    /**
     * Send event to a specific user
     */
    sendToUser(userId: string, type: WSEventType, payload: any): void;
    /**
     * Broadcast PR updates
     */
    notifyPRUpdate(prId: string, repoId: string, type: "created" | "updated" | "merged" | "review_added", data: any): void;
    /**
     * Broadcast AI review progress
     */
    notifyAIProgress(prId: string, stage: "started" | "completed", data: any): void;
    /**
     * Broadcast stack updates
     */
    notifyStackUpdate(stackId: string, userId: string, data: any): void;
    /**
     * Broadcast conflict detection
     */
    notifyConflictDetected(prIds: string[], repoId: string, data: any): void;
    /**
     * Get connection stats
     */
    getStats(): {
        totalConnections: number;
        authenticatedConnections: number;
        subscriptionCounts: Record<string, number>;
    };
    private getSubscriptionCounts;
    /**
     * Graceful shutdown
     */
    close(): void;
}
export declare function initRealtimeServer(server: Server): RealtimeServer;
export declare function getRealtimeServer(): RealtimeServer | null;
//# sourceMappingURL=websocket.d.ts.map
/**
 * NEXUS Database Schema
 * Comprehensive schema for AI-powered code review platform
 */

import {
    pgTable,
    text,
    timestamp,
    uuid,
    integer,
    boolean,
    jsonb,
    pgEnum,
    real,
    index,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// ENUMS
// ============================================================================

export const planEnum = pgEnum("plan", ["hobby", "starter", "team", "enterprise"]);
export const roleEnum = pgEnum("role", ["owner", "admin", "member"]);
export const platformEnum = pgEnum("platform", ["github", "gitlab", "bitbucket", "azure"]);
export const prStatusEnum = pgEnum("pr_status", ["draft", "open", "approved", "changes_requested", "merged", "closed"]);
export const reviewStatusEnum = pgEnum("review_status", ["approved", "changes_requested", "commented"]);
export const riskLevelEnum = pgEnum("risk_level", ["low", "medium", "high", "critical"]);
export const queueStatusEnum = pgEnum("queue_status", ["pending", "running", "passed", "failed", "merged"]);
export const aiReviewJobStatusEnum = pgEnum("ai_review_job_status", ["queued", "running", "completed", "failed"]);
export const chatSessionStatusEnum = pgEnum("chat_session_status", ["active", "archived"]);
export const chatMessageRoleEnum = pgEnum("chat_message_role", ["user", "assistant", "system", "tool"]);

// ============================================================================
// USERS & ORGANIZATIONS
// ============================================================================

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    avatar: text("avatar"),
    githubId: text("github_id").unique(),
    gitlabId: text("gitlab_id").unique(),
    bitbucketId: text("bitbucket_id").unique(),
    azureId: text("azure_id").unique(),
    settings: jsonb("settings").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
    githubIdx: index("users_github_idx").on(table.githubId),
}));

export const organizations = pgTable("organizations", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    avatar: text("avatar"),
    plan: planEnum("plan").default("hobby").notNull(),
    settings: jsonb("settings").default({}),
    // AI Configuration
    aiProvider: text("ai_provider").default("anthropic"),
    aiModel: text("ai_model").default("claude-sonnet-4-20250514"),
    aiEnabled: boolean("ai_enabled").default(true),
    // Billing
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    slugIdx: uniqueIndex("organizations_slug_idx").on(table.slug),
}));

export const orgMembers = pgTable("org_members", {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").default("member").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    orgUserIdx: uniqueIndex("org_members_org_user_idx").on(table.orgId, table.userId),
}));

// ============================================================================
// REPOSITORIES
// ============================================================================

export const repositories = pgTable("repositories", {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    defaultBranch: text("default_branch").default("main").notNull(),
    private: boolean("private").default(false).notNull(),
    // Settings
    aiReviewEnabled: boolean("ai_review_enabled").default(true),
    mergeQueueEnabled: boolean("merge_queue_enabled").default(false),
    autoMergeEnabled: boolean("auto_merge_enabled").default(false),
    settings: jsonb("settings").default({}),
    // Webhook
    webhookId: text("webhook_id"),
    webhookSecret: text("webhook_secret"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    orgIdx: index("repositories_org_idx").on(table.orgId),
    platformExternalIdx: uniqueIndex("repositories_platform_external_idx").on(table.platform, table.externalId),
}));

// ============================================================================
// STACKS & BRANCHES
// ============================================================================

export const stacks = pgTable("stacks", {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    baseBranch: text("base_branch").default("main").notNull(),
    status: text("status").default("active").notNull(), // active, merged, abandoned
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    repoIdx: index("stacks_repo_idx").on(table.repoId),
    userIdx: index("stacks_user_idx").on(table.userId),
}));

export const branches: any = pgTable("branches", {
    id: uuid("id").primaryKey().defaultRandom(),
    stackId: uuid("stack_id").notNull().references(() => stacks.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(), // Order in stack (0 = bottom)
    parentBranchId: uuid("parent_branch_id").references(() => (branches as any).id),
    // PR Info (if submitted)
    prNumber: integer("pr_number"),
    prUrl: text("pr_url"),
    prTitle: text("pr_title"),
    prStatus: prStatusEnum("pr_status"),
    // Metadata
    commitSha: text("commit_sha"),
    linesAdded: integer("lines_added").default(0),
    linesRemoved: integer("lines_removed").default(0),
    filesChanged: integer("files_changed").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    stackIdx: index("branches_stack_idx").on(table.stackId),
    prIdx: index("branches_pr_idx").on(table.repoId, table.prNumber),
}));

// ============================================================================
// PULL REQUESTS
// ============================================================================

export const pullRequests = pgTable("pull_requests", {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    repoId: uuid("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id),
    // PR Details
    number: integer("number").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    url: text("url").notNull(),
    status: prStatusEnum("status").default("open").notNull(),
    isDraft: boolean("is_draft").default(false),
    // Metrics
    linesAdded: integer("lines_added").default(0),
    linesRemoved: integer("lines_removed").default(0),
    filesChanged: integer("files_changed").default(0),
    commitsCount: integer("commits_count").default(0),
    // AI Analysis
    aiSummary: text("ai_summary"),
    riskScore: real("risk_score"),
    riskLevel: riskLevelEnum("risk_level"),
    riskFactors: jsonb("risk_factors").default([]),
    estimatedReviewMinutes: integer("estimated_review_minutes"),
    // Timestamps
    publishedAt: timestamp("published_at"),
    firstReviewAt: timestamp("first_review_at"),
    approvedAt: timestamp("approved_at"),
    mergedAt: timestamp("merged_at"),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    repoNumberIdx: uniqueIndex("pull_requests_repo_number_idx").on(table.repoId, table.number),
    authorIdx: index("pull_requests_author_idx").on(table.authorId),
    statusIdx: index("pull_requests_status_idx").on(table.status),
}));

// ============================================================================
// REVIEWS & COMMENTS
// ============================================================================

export const reviews = pgTable("reviews", {
    id: uuid("id").primaryKey().defaultRandom(),
    prId: uuid("pr_id").notNull().references(() => pullRequests.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    status: reviewStatusEnum("status").notNull(),
    body: text("body"),
    isAi: boolean("is_ai").default(false).notNull(),
    aiModel: text("ai_model"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    prIdx: index("reviews_pr_idx").on(table.prId),
}));

export const comments = pgTable("comments", {
    id: uuid("id").primaryKey().defaultRandom(),
    prId: uuid("pr_id").notNull().references(() => pullRequests.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id").references(() => reviews.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    // Location
    filePath: text("file_path"),
    lineNumber: integer("line_number"),
    side: text("side"), // LEFT or RIGHT
    // Content
    body: text("body").notNull(),
    suggestionCode: text("suggestion_code"),
    isAi: boolean("is_ai").default(false).notNull(),
    aiModel: text("ai_model"),
    aiCategory: text("ai_category"), // bug, style, security, performance, etc.
    aiSeverity: text("ai_severity"), // info, warning, error
    // Feedback
    wasHelpful: boolean("was_helpful"),
    wasAccepted: boolean("was_accepted"),
    // External
    externalId: text("external_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    prIdx: index("comments_pr_idx").on(table.prId),
    aiIdx: index("comments_ai_idx").on(table.isAi),
}));

// ============================================================================
// MERGE QUEUE
// ============================================================================

export const mergeQueue = pgTable("merge_queue", {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
    prId: uuid("pr_id").notNull().references(() => pullRequests.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    priority: integer("priority").default(0).notNull(),
    status: queueStatusEnum("status").default("pending").notNull(),
    ciRunId: text("ci_run_id"),
    ciStatus: text("ci_status"),
    ciUrl: text("ci_url"),
    errorMessage: text("error_message"),
    attempts: integer("attempts").default(0),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    repoPositionIdx: index("merge_queue_repo_position_idx").on(table.repoId, table.position),
    statusIdx: index("merge_queue_status_idx").on(table.status),
}));

// ============================================================================
// AI REVIEW JOBS
// ============================================================================

export const aiReviewJobs = pgTable("ai_review_jobs", {
    id: uuid("id").primaryKey().defaultRandom(),
    prId: uuid("pr_id").notNull().references(() => pullRequests.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    status: aiReviewJobStatusEnum("status").default("queued").notNull(),
    provider: text("provider"),
    model: text("model"),
    findingsCount: integer("findings_count").default(0).notNull(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    prStatusIdx: index("ai_review_jobs_pr_status_idx").on(table.prId, table.status),
    createdIdx: index("ai_review_jobs_created_idx").on(table.createdAt),
}));

// ============================================================================
// CHAT SESSIONS & MESSAGES
// ============================================================================

export const chatSessions = pgTable("chat_sessions", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    repoId: uuid("repo_id").references(() => repositories.id, { onDelete: "set null" }),
    prId: uuid("pr_id").references(() => pullRequests.id, { onDelete: "set null" }),
    stackId: uuid("stack_id").references(() => stacks.id, { onDelete: "set null" }),
    title: text("title").notNull().default("New chat"),
    status: chatSessionStatusEnum("status").default("active").notNull(),
    context: jsonb("context").default({}),
    lastMessageAt: timestamp("last_message_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    userUpdatedIdx: index("chat_sessions_user_updated_idx").on(table.userId, table.updatedAt),
    prUpdatedIdx: index("chat_sessions_pr_updated_idx").on(table.prId, table.updatedAt),
    stackUpdatedIdx: index("chat_sessions_stack_updated_idx").on(table.stackId, table.updatedAt),
    repoUpdatedIdx: index("chat_sessions_repo_updated_idx").on(table.repoId, table.updatedAt),
}));

export const chatMessages = pgTable("chat_messages", {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
    role: chatMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    provider: text("provider"),
    model: text("model"),
    citations: jsonb("citations").default([]),
    toolActions: jsonb("tool_actions").default([]),
    provenance: jsonb("provenance").default({}),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    sessionCreatedIdx: index("chat_messages_session_created_idx").on(table.sessionId, table.createdAt),
    roleIdx: index("chat_messages_role_idx").on(table.role),
}));

// ============================================================================
// AI CONFIGURATION
// ============================================================================

export const aiRules = pgTable("ai_rules", {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    prompt: text("prompt").notNull(),
    regexPattern: text("regex_pattern"),
    filePatterns: jsonb("file_patterns").default([]), // ["*.ts", "*.tsx"]
    severity: text("severity").default("warning"),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    orgIdx: index("ai_rules_org_idx").on(table.orgId),
}));

export const aiTraining = pgTable("ai_training", {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    prId: uuid("pr_id").notNull().references(() => pullRequests.id, { onDelete: "cascade" }),
    acceptedComments: jsonb("accepted_comments").default([]),
    rejectedComments: jsonb("rejected_comments").default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// AUTOMATIONS
// ============================================================================

export const automations = pgTable("automations", {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Trigger
    trigger: jsonb("trigger").notNull(), // { event: "pr_opened", filters: {...} }
    // Actions
    actions: jsonb("actions").notNull(), // [{ type: "add_reviewer", value: "@team" }]
    enabled: boolean("enabled").default(true).notNull(),
    runCount: integer("run_count").default(0),
    lastRunAt: timestamp("last_run_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// AUDIT LOG
// ============================================================================

export const auditLog = pgTable("audit_log", {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    orgTimeIdx: index("audit_log_org_time_idx").on(table.orgId, table.createdAt),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
    orgMembers: many(orgMembers),
    stacks: many(stacks),
    pullRequests: many(pullRequests),
    reviews: many(reviews),
    comments: many(comments),
    aiReviewJobsRequested: many(aiReviewJobs),
    chatSessions: many(chatSessions),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
    members: many(orgMembers),
    repositories: many(repositories),
    aiRules: many(aiRules),
    automations: many(automations),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
    organization: one(organizations, {
        fields: [orgMembers.orgId],
        references: [organizations.id],
    }),
    user: one(users, {
        fields: [orgMembers.userId],
        references: [users.id],
    }),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
    organization: one(organizations, {
        fields: [repositories.orgId],
        references: [organizations.id],
    }),
    stacks: many(stacks),
    branches: many(branches),
    pullRequests: many(pullRequests),
    mergeQueue: many(mergeQueue),
    chatSessions: many(chatSessions),
}));

export const stacksRelations = relations(stacks, ({ one, many }) => ({
    repository: one(repositories, {
        fields: [stacks.repoId],
        references: [repositories.id],
    }),
    user: one(users, {
        fields: [stacks.userId],
        references: [users.id],
    }),
    branches: many(branches),
    chatSessions: many(chatSessions),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
    stack: one(stacks, {
        fields: [branches.stackId],
        references: [stacks.id],
    }),
    repository: one(repositories, {
        fields: [branches.repoId],
        references: [repositories.id],
    }),
    parentBranch: one(branches, {
        fields: [branches.parentBranchId],
        references: [branches.id],
    }),
    childBranches: many(branches),
    pullRequest: one(pullRequests),
}));

export const pullRequestsRelations = relations(pullRequests, ({ one, many }) => ({
    branch: one(branches, {
        fields: [pullRequests.branchId],
        references: [branches.id],
    }),
    repository: one(repositories, {
        fields: [pullRequests.repoId],
        references: [repositories.id],
    }),
    author: one(users, {
        fields: [pullRequests.authorId],
        references: [users.id],
    }),
    reviews: many(reviews),
    comments: many(comments),
    aiReviewJobs: many(aiReviewJobs),
    chatSessions: many(chatSessions),
}));

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
    pullRequest: one(pullRequests, {
        fields: [reviews.prId],
        references: [pullRequests.id],
    }),
    user: one(users, {
        fields: [reviews.userId],
        references: [users.id],
    }),
    comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
    pullRequest: one(pullRequests, {
        fields: [comments.prId],
        references: [pullRequests.id],
    }),
    review: one(reviews, {
        fields: [comments.reviewId],
        references: [reviews.id],
    }),
    user: one(users, {
        fields: [comments.userId],
        references: [users.id],
    }),
}));

export const aiReviewJobsRelations = relations(aiReviewJobs, ({ one }) => ({
    pullRequest: one(pullRequests, {
        fields: [aiReviewJobs.prId],
        references: [pullRequests.id],
    }),
    requestedBy: one(users, {
        fields: [aiReviewJobs.requestedByUserId],
        references: [users.id],
    }),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
    user: one(users, {
        fields: [chatSessions.userId],
        references: [users.id],
    }),
    repository: one(repositories, {
        fields: [chatSessions.repoId],
        references: [repositories.id],
    }),
    pullRequest: one(pullRequests, {
        fields: [chatSessions.prId],
        references: [pullRequests.id],
    }),
    stack: one(stacks, {
        fields: [chatSessions.stackId],
        references: [stacks.id],
    }),
    messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
    session: one(chatSessions, {
        fields: [chatMessages.sessionId],
        references: [chatSessions.id],
    }),
}));

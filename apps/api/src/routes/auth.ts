/**
 * NEXUS API - Authentication Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { SignJWT, jwtVerify } from "jose";

const authRouter = new Hono();

// JWT secret (in production, use proper key management)
const JWT_SECRET = new TextEncoder().encode(
    process.env.AUTH_SECRET || "nexus-dev-secret-change-in-production"
);

// Schema definitions
const loginSchema = z.object({
    provider: z.enum(["github", "gitlab", "bitbucket"]),
    code: z.string(),
    redirectUri: z.string().optional(),
});

const tokenSchema = z.object({
    refreshToken: z.string(),
});

// GitHub OAuth
authRouter.post("/github", zValidator("json", loginSchema), async (c) => {
    const { code, redirectUri } = c.req.valid("json");

    try {
        // Exchange code for access token
        const tokenResponse = await fetch(
            "https://github.com/login/oauth/access_token",
            {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    client_id: process.env.GITHUB_CLIENT_ID,
                    client_secret: process.env.GITHUB_CLIENT_SECRET,
                    code,
                    redirect_uri: redirectUri,
                }),
            }
        );

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            return c.json({ error: tokenData.error_description }, 400);
        }

        // Get user info
        const userResponse = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });

        const userData = await userResponse.json();

        // Create JWT tokens
        const accessToken = await new SignJWT({
            sub: userData.id.toString(),
            email: userData.email,
            username: userData.login,
            avatar: userData.avatar_url,
            provider: "github",
            githubToken: tokenData.access_token,
        })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("1h")
            .sign(JWT_SECRET);

        const refreshToken = await new SignJWT({
            sub: userData.id.toString(),
            type: "refresh",
        })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("30d")
            .sign(JWT_SECRET);

        return c.json({
            accessToken,
            refreshToken,
            user: {
                id: userData.id.toString(),
                email: userData.email,
                username: userData.login,
                name: userData.name,
                avatar: userData.avatar_url,
                provider: "github",
            },
        });
    } catch (error) {
        console.error("GitHub auth error:", error);
        return c.json({ error: "Authentication failed" }, 500);
    }
});

// GitLab OAuth
authRouter.post("/gitlab", zValidator("json", loginSchema), async (c) => {
    const { code, redirectUri } = c.req.valid("json");
    const gitlabUrl = process.env.GITLAB_URL || "https://gitlab.com";

    try {
        const tokenResponse = await fetch(`${gitlabUrl}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: process.env.GITLAB_CLIENT_ID,
                client_secret: process.env.GITLAB_CLIENT_SECRET,
                code,
                grant_type: "authorization_code",
                redirect_uri: redirectUri,
            }),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            return c.json({ error: tokenData.error_description }, 400);
        }

        const userResponse = await fetch(`${gitlabUrl}/api/v4/user`, {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        const userData = await userResponse.json();

        const accessToken = await new SignJWT({
            sub: userData.id.toString(),
            email: userData.email,
            username: userData.username,
            avatar: userData.avatar_url,
            provider: "gitlab",
            gitlabToken: tokenData.access_token,
        })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("1h")
            .sign(JWT_SECRET);

        const refreshToken = await new SignJWT({
            sub: userData.id.toString(),
            type: "refresh",
        })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("30d")
            .sign(JWT_SECRET);

        return c.json({
            accessToken,
            refreshToken,
            user: {
                id: userData.id.toString(),
                email: userData.email,
                username: userData.username,
                name: userData.name,
                avatar: userData.avatar_url,
                provider: "gitlab",
            },
        });
    } catch (error) {
        console.error("GitLab auth error:", error);
        return c.json({ error: "Authentication failed" }, 500);
    }
});

// Refresh token
authRouter.post("/refresh", zValidator("json", tokenSchema), async (c) => {
    const { refreshToken } = c.req.valid("json");

    try {
        const { payload } = await jwtVerify(refreshToken, JWT_SECRET);

        if (payload.type !== "refresh") {
            return c.json({ error: "Invalid token type" }, 400);
        }

        // In production, verify against database and check if revoked

        const newAccessToken = await new SignJWT({
            sub: payload.sub,
        })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("1h")
            .sign(JWT_SECRET);

        return c.json({ accessToken: newAccessToken });
    } catch (error) {
        return c.json({ error: "Invalid refresh token" }, 401);
    }
});

// Get current user
authRouter.get("/me", async (c) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.slice(7);

    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);

        return c.json({
            user: {
                id: payload.sub,
                email: payload.email,
                username: payload.username,
                avatar: payload.avatar,
                provider: payload.provider,
            },
        });
    } catch (error) {
        return c.json({ error: "Invalid token" }, 401);
    }
});

// Logout
authRouter.post("/logout", async (c) => {
    // In production, add refresh token to revocation list
    return c.json({ success: true });
});

export { authRouter };

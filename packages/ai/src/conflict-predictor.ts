/**
 * NEXUS Predictive Conflict Prevention
 * AI predicts merge conflicts BEFORE they happen
 */

import type { DiffContext } from "./types";

interface ConflictPrediction {
    conflictProbability: number; // 0-1
    conflictingPRs: Array<{
        prNumber: number;
        prTitle: string;
        authorUsername: string;
        conflictingFiles: string[];
        conflictingLines: Array<{
            file: string;
            yourLines: [number, number];
            theirLines: [number, number];
        }>;
        lastUpdated: Date;
    }>;
    safeWindow: {
        hours: number;
        reasoning: string;
    };
    recommendations: string[];
}

interface PRContext {
    number: number;
    title: string;
    authorUsername: string;
    files: Array<{
        path: string;
        linesModified: [number, number][];
    }>;
    lastUpdated: Date;
    baseBranch: string;
    velocity: number; // Commits per day
}

interface FileHistory {
    path: string;
    recentModifiers: Array<{
        userId: string;
        username: string;
        lastModified: Date;
        frequency: number; // Modifications in last 30 days
    }>;
    hotspotScore: number; // 0-1, how often this file causes conflicts
    avgConflictResolutionMinutes: number;
}

export class ConflictPredictor {
    private fileHistoryCache: Map<string, FileHistory> = new Map();

    /**
     * Predict potential conflicts for a PR
     */
    async predictConflicts(
        myDiffs: DiffContext[],
        myBranch: string,
        openPRs: PRContext[],
        fileHistories: Map<string, FileHistory>
    ): Promise<ConflictPrediction> {
        const myFiles = new Set(myDiffs.map((d) => d.file));
        const myLinesByFile = this.extractLineRanges(myDiffs);

        const conflictingPRs: ConflictPrediction["conflictingPRs"] = [];
        let maxConflictProbability = 0;

        for (const pr of openPRs) {
            if (pr.authorUsername === "me") continue; // Skip own PRs

            const overlappingFiles = pr.files.filter((f) => myFiles.has(f.path));
            if (overlappingFiles.length === 0) continue;

            const conflictingLines: ConflictPrediction["conflictingPRs"][0]["conflictingLines"] = [];
            let fileConflictScore = 0;

            for (const file of overlappingFiles) {
                const myLines = myLinesByFile.get(file.path) || [];
                const theirLines = file.linesModified;

                // Check for overlapping line ranges
                for (const myRange of myLines) {
                    for (const theirRange of theirLines) {
                        if (this.rangesOverlap(myRange, theirRange)) {
                            conflictingLines.push({
                                file: file.path,
                                yourLines: myRange,
                                theirLines: theirRange,
                            });
                            fileConflictScore += 0.3;
                        } else if (this.rangesNear(myRange, theirRange, 5)) {
                            // Near each other (within 5 lines)
                            fileConflictScore += 0.1;
                        }
                    }
                }

                // Factor in file hotspot score
                const history = fileHistories.get(file.path);
                if (history) {
                    fileConflictScore += history.hotspotScore * 0.2;
                }
            }

            const prConflictProbability = Math.min(1, fileConflictScore);

            if (prConflictProbability > 0.1) {
                conflictingPRs.push({
                    prNumber: pr.number,
                    prTitle: pr.title,
                    authorUsername: pr.authorUsername,
                    conflictingFiles: overlappingFiles.map((f) => f.path),
                    conflictingLines,
                    lastUpdated: pr.lastUpdated,
                });

                maxConflictProbability = Math.max(maxConflictProbability, prConflictProbability);
            }
        }

        // Calculate safe merge window
        const safeWindow = this.calculateSafeWindow(conflictingPRs, openPRs);

        // Generate recommendations
        const recommendations = this.generateRecommendations(
            conflictingPRs,
            maxConflictProbability,
            safeWindow
        );

        return {
            conflictProbability: maxConflictProbability,
            conflictingPRs,
            safeWindow,
            recommendations,
        };
    }

    /**
     * Extract line ranges from diffs
     */
    private extractLineRanges(diffs: DiffContext[]): Map<string, [number, number][]> {
        const result = new Map<string, [number, number][]>();

        for (const diff of diffs) {
            const ranges: [number, number][] = [];
            const lines = diff.diff.split("\n");

            let currentLine = 0;
            let rangeStart: number | null = null;

            for (const line of lines) {
                // Parse @@ -a,b +c,d @@ hunk headers
                const hunkMatch = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
                if (hunkMatch) {
                    currentLine = parseInt(hunkMatch[2], 10);
                    continue;
                }

                if (line.startsWith("+") && !line.startsWith("+++")) {
                    if (rangeStart === null) rangeStart = currentLine;
                    currentLine++;
                } else if (line.startsWith("-") && !line.startsWith("---")) {
                    if (rangeStart === null) rangeStart = currentLine;
                } else {
                    if (rangeStart !== null) {
                        ranges.push([rangeStart, currentLine - 1]);
                        rangeStart = null;
                    }
                    if (!line.startsWith("-")) currentLine++;
                }
            }

            if (rangeStart !== null) {
                ranges.push([rangeStart, currentLine]);
            }

            result.set(diff.file, ranges);
        }

        return result;
    }

    /**
     * Check if two line ranges overlap
     */
    private rangesOverlap(a: [number, number], b: [number, number]): boolean {
        return a[0] <= b[1] && b[0] <= a[1];
    }

    /**
     * Check if two ranges are near each other
     */
    private rangesNear(a: [number, number], b: [number, number], distance: number): boolean {
        return (
            Math.abs(a[0] - b[1]) <= distance ||
            Math.abs(b[0] - a[1]) <= distance
        );
    }

    /**
     * Calculate safe merge window
     */
    private calculateSafeWindow(
        conflictingPRs: ConflictPrediction["conflictingPRs"],
        allPRs: PRContext[]
    ): ConflictPrediction["safeWindow"] {
        if (conflictingPRs.length === 0) {
            return {
                hours: 168, // 1 week
                reasoning: "No conflicting PRs detected",
            };
        }

        // Estimate when conflicting PRs might merge based on velocity
        const conflictingPRNumbers = new Set(conflictingPRs.map((p) => p.prNumber));
        const relevantPRs = allPRs.filter((p) => conflictingPRNumbers.has(p.number));

        // Find the PR most likely to merge soon
        let minHoursToMerge = Infinity;

        for (const pr of relevantPRs) {
            // Simple heuristic: PRs with higher velocity merge faster
            const hoursEstimate = 24 / Math.max(0.1, pr.velocity);
            minHoursToMerge = Math.min(minHoursToMerge, hoursEstimate);
        }

        if (minHoursToMerge === Infinity) {
            minHoursToMerge = 24; // Default to 1 day
        }

        return {
            hours: Math.round(minHoursToMerge),
            reasoning: `Based on PR velocity, ${conflictingPRs[0]?.authorUsername}'s PR may merge in ~${Math.round(minHoursToMerge)} hours`,
        };
    }

    /**
     * Generate actionable recommendations
     */
    private generateRecommendations(
        conflictingPRs: ConflictPrediction["conflictingPRs"],
        conflictProbability: number,
        safeWindow: ConflictPrediction["safeWindow"]
    ): string[] {
        const recommendations: string[] = [];

        if (conflictProbability === 0) {
            recommendations.push("✅ No conflicts predicted. Safe to proceed.");
            return recommendations;
        }

        if (conflictProbability > 0.7) {
            recommendations.push(
                `⚠️ High conflict probability (${Math.round(conflictProbability * 100)}%). Coordinate with ${conflictingPRs[0]?.authorUsername}.`
            );
            recommendations.push(
                "🤝 Consider pairing to resolve conflicts proactively."
            );
        } else if (conflictProbability > 0.3) {
            recommendations.push(
                `⚡ Moderate conflict risk. Merge within ${safeWindow.hours} hours to avoid issues.`
            );
        }

        if (conflictingPRs.length === 1) {
            recommendations.push(
                `💬 Reach out to @${conflictingPRs[0].authorUsername} to coordinate merge order.`
            );
        } else {
            recommendations.push(
                `📢 ${conflictingPRs.length} PRs may conflict. Consider a sync meeting.`
            );
        }

        // Specific file recommendations
        const hotFiles = conflictingPRs
            .flatMap((p) => p.conflictingLines)
            .reduce((acc, line) => {
                acc[line.file] = (acc[line.file] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

        const hottestFile = Object.entries(hotFiles).sort((a, b) => b[1] - a[1])[0];
        if (hottestFile && hottestFile[1] > 2) {
            recommendations.push(
                `🔥 ${hottestFile[0]} is a hotspot. Consider splitting changes.`
            );
        }

        return recommendations;
    }
}

/**
 * Time Tracker Extension
 *
 * Displays session timing information in the footer:
 * - Session duration and start time
 * - Working time (agent actively processing)
 * - Idle time (waiting for user)
 *
 * Persists timing data via pi.appendEntry() for reload/resume support.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// Entry type for persisting timing data
interface TimingEntry {
	sessionStartTime: number;
	totalWorkingTime: number;
	totalStreamingTime: number;
}

// Format time as HH:MM:SS
function formatTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// Format time of day as HH:MM:SS
function formatTimeOfDay(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
}

// Format token counts
function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

// Sanitize text for single-line display
function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

export default function (pi: ExtensionAPI) {
	// Timing state
	let sessionStartTime = Date.now();
	let totalWorkingTime = 0;
	let turnStartTime: number | null = null;
	// Streaming/TPS state
	let totalStreamingTime = 0;
	let currentStreamStart: number | null = null;
	// Current context (set in session_start, used in footer render)
	let currentCtx: ExtensionContext | null = null;

	// Restore timing state from session entries
	function restoreTimingState(ctx: ExtensionContext) {
		// Find the earliest timing entry (first session start)
		const entries = ctx.sessionManager.getEntries();
		for (const entry of entries) {
			if (entry.type === "custom" && entry.customType === "pi-time-tracker") {
				const data = entry.data as TimingEntry;
				sessionStartTime = data.sessionStartTime;
				totalWorkingTime = data.totalWorkingTime;
				totalStreamingTime = data.totalStreamingTime ?? 0;
				return;
			}
		}
		// No existing timing entry - this is a new session
		sessionStartTime = Date.now();
		totalWorkingTime = 0;
		totalStreamingTime = 0;
		// Persist initial timing state
		pi.appendEntry("pi-time-tracker", {
			sessionStartTime,
			totalWorkingTime,
			totalStreamingTime,
		} as TimingEntry);
	}

	// Update persisted timing state
	function persistTimingState() {
		pi.appendEntry("pi-time-tracker", {
			sessionStartTime,
			totalWorkingTime,
			totalStreamingTime,
		} as TimingEntry);
	}

	// Calculate current working time (including ongoing turn)
	function getCurrentWorkingTime(): number {
		let working = totalWorkingTime;
		if (turnStartTime !== null) {
			working += Date.now() - turnStartTime;
		}
		return working;
	}

	// Register the custom footer
	function setCustomFooter(ctx: ExtensionContext) {
		currentCtx = ctx;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					// Get current model and thinking level
					const model = currentCtx?.model;
					const thinkingLevel = pi.getThinkingLevel();

					// Calculate cumulative usage from ALL session entries
					let totalInput = 0;
					let totalOutput = 0;
					let totalCacheRead = 0;
					let totalCacheWrite = 0;
					let totalCost = 0;

					if (currentCtx) {
						for (const entry of currentCtx.sessionManager.getEntries()) {
							if (entry.type === "message" && entry.message.role === "assistant") {
								const m = entry.message as AssistantMessage;
								totalInput += m.usage.input;
								totalOutput += m.usage.output;
								totalCacheRead += m.usage.cacheRead;
								totalCacheWrite += m.usage.cacheWrite;
								totalCost += m.usage.cost.total;
							}
						}
					}

					// Calculate context usage
					const contextUsage = currentCtx?.getContextUsage();
					const contextWindow = contextUsage?.contextWindow ?? model?.contextWindow ?? 0;
					const contextPercentValue = contextUsage?.percent ?? 0;
					const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";

					// Build path line
					let pwd = process.cwd();
					const home = process.env.HOME || process.env.USERPROFILE;
					if (home && pwd.startsWith(home)) {
						pwd = `~${pwd.slice(home.length)}`;
					}

					// Add git branch if available
					const branch = footerData.getGitBranch();
					if (branch) {
						pwd = `${pwd} (${branch})`;
					}

					// Add session name if set
					const sessionName = currentCtx?.sessionManager.getSessionName();
					if (sessionName) {
						pwd = `${pwd} • ${sessionName}`;
					}

					// Truncate path if too long
					if (pwd.length > width) {
						const half = Math.floor(width / 2) - 2;
						if (half > 1) {
							const start = pwd.slice(0, half);
							const end = pwd.slice(-(half - 1));
							pwd = `${start}...${end}`;
						} else {
							pwd = pwd.slice(0, Math.max(1, width));
						}
					}

					// Build stats line
					const statsParts: string[] = [];
					if (totalInput) statsParts.push(`↑${formatTokens(totalInput)}`);
					if (totalOutput) statsParts.push(`↓${formatTokens(totalOutput)}`);
					if (totalCacheRead) statsParts.push(`R${formatTokens(totalCacheRead)}`);
					if (totalCacheWrite) statsParts.push(`W${formatTokens(totalCacheWrite)}`);

					// Show cost with "(sub)" indicator if using OAuth subscription
					const usingSubscription = model ? currentCtx?.modelRegistry.isUsingOAuth(model) : false;
					if (totalCost || usingSubscription) {
						const costStr = `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`;
						statsParts.push(costStr);
					}

					// Colorize context percentage
					const contextPercentDisplay =
						contextPercent === "?"
							? `?/${formatTokens(contextWindow)}`
							: `${contextPercent}%/${formatTokens(contextWindow)}`;

					let contextPercentStr: string;
					if (contextPercentValue > 90) {
						contextPercentStr = theme.fg("error", contextPercentDisplay);
					} else if (contextPercentValue > 70) {
						contextPercentStr = theme.fg("warning", contextPercentDisplay);
					} else {
						contextPercentStr = contextPercentDisplay;
					}
					statsParts.push(contextPercentStr);

					let statsLeft = statsParts.join(" ");

					// Model name on right side
					const modelName = model?.id || "no-model";

					let statsLeftWidth = visibleWidth(statsLeft);

					// Truncate stats if too wide
					if (statsLeftWidth > width) {
						const plainStatsLeft = statsLeft.replace(/\x1b\[[0-9;]*m/g, "");
						statsLeft = `${plainStatsLeft.substring(0, width - 3)}...`;
						statsLeftWidth = visibleWidth(statsLeft);
					}

					// Build right side with thinking level
					let rightSideWithoutProvider = modelName;
					if (model?.reasoning) {
						rightSideWithoutProvider =
							thinkingLevel === "off" ? `${modelName} • thinking off` : `${modelName} • ${thinkingLevel}`;
					}

					// Prepend provider if multiple providers available
					let rightSide = rightSideWithoutProvider;
					if (footerData.getAvailableProviderCount() > 1 && model) {
						rightSide = `(${model.provider}) ${rightSideWithoutProvider}`;
						if (statsLeftWidth + 2 + visibleWidth(rightSide) > width) {
							rightSide = rightSideWithoutProvider;
						}
					}

					const rightSideWidth = visibleWidth(rightSide);
					const minPadding = 2;
					const totalNeeded = statsLeftWidth + minPadding + rightSideWidth;

					let statsLine: string;
					if (totalNeeded <= width) {
						const padding = " ".repeat(width - statsLeftWidth - rightSideWidth);
						statsLine = statsLeft + padding + rightSide;
					} else {
						const availableForRight = width - statsLeftWidth - minPadding;
						if (availableForRight > 3) {
							const plainRightSide = rightSide.replace(/\x1b\[[0-9;]*m/g, "");
							const truncatedPlain = plainRightSide.substring(0, availableForRight);
							const padding = " ".repeat(width - statsLeftWidth - truncatedPlain.length);
							statsLine = statsLeft + padding + truncatedPlain;
						} else {
							statsLine = statsLeft;
						}
					}

					// Apply dim styling
					const dimStatsLeft = theme.fg("dim", statsLeft);
					const remainder = statsLine.slice(statsLeft.length);
					const dimRemainder = theme.fg("dim", remainder);

					const lines = [theme.fg("dim", pwd), dimStatsLeft + dimRemainder];

					// Build timing line
					const sessionTime = Date.now() - sessionStartTime;
					const workingTime = getCurrentWorkingTime();
					const idleTime = sessionTime - workingTime;

					const startTimeStr = formatTimeOfDay(sessionStartTime);
					const sessionTimeStr = formatTime(sessionTime);
					const workingTimeStr = formatTime(workingTime);
					const idleTimeStr = formatTime(idleTime);

					// Calculate TPS (output tokens per second of actual LLM streaming time)
					let currentStreamingTime = totalStreamingTime;
					if (currentStreamStart !== null) {
						currentStreamingTime += Date.now() - currentStreamStart;
					}
					const streamingSeconds = currentStreamingTime / 1000;
					const tps = streamingSeconds > 0 ? totalOutput / streamingSeconds : 0;
					const tpsStr = tps > 0 ? `${tps.toFixed(1)} tok/s` : "";

					// Timing line with icons
					const timingParts = [
						`⏱ ${sessionTimeStr} (started ${startTimeStr})`,
						`⚙ ${workingTimeStr}`,
						`💤 ${idleTimeStr}`,
					];

					// Add TPS if we have token data
					if (tpsStr) {
						timingParts.push(`🚀 ${tpsStr}`);
					}

					let timingLine = timingParts.join("  ");

					// Truncate if needed
					if (visibleWidth(timingLine) > width) {
						timingLine = truncateToWidth(timingLine, width, "...");
					}

					lines.push(theme.fg("dim", timingLine));

					// Add extension statuses if any
					const extensionStatuses = footerData.getExtensionStatuses();
					if (extensionStatuses.size > 0) {
						const sortedStatuses = Array.from(extensionStatuses.entries())
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([, text]) => sanitizeStatusText(text));
						const statusLine = sortedStatuses.join(" ");
						lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
					}

					return lines;
				},
			};
		});
	}

	// Restore state on session start
	pi.on("session_start", async (event, ctx) => {
		if (event.reason === "new") {
			sessionStartTime = Date.now();
			totalWorkingTime = 0;
			turnStartTime = null;
			totalStreamingTime = 0;
			currentStreamStart = null;
			persistTimingState();
		} else {
			restoreTimingState(ctx);
		}
		setCustomFooter(ctx);
	});

	// Track turn start (agent begins working)
	pi.on("turn_start", async (_event, _ctx) => {
		turnStartTime = Date.now();
	});

	// Track turn end (agent finishes working)
	pi.on("turn_end", async (_event, _ctx) => {
		if (turnStartTime !== null) {
			totalWorkingTime += Date.now() - turnStartTime;
			turnStartTime = null;
			persistTimingState();
		}
	});

	// Track LLM streaming start
	pi.on("message_start", async (event, _ctx) => {
		if (event.message.role === "assistant") {
			currentStreamStart = Date.now();
		}
	});

	// Track LLM streaming end — accumulate streaming duration
	pi.on("message_end", async (event, _ctx) => {
		if (event.message.role === "assistant" && currentStreamStart !== null) {
			totalStreamingTime += Date.now() - currentStreamStart;
			currentStreamStart = null;
		}
	});

}
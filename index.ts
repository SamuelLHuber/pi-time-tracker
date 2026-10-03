/** Branch-aware timing widget. Pi retains ownership of its model/cost footer. */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

interface TimingEntry {
	sessionStartTime: number;
	totalWorkingTime: number;
	totalStreamingTime: number;
}

function formatTime(ms: number): string {
	const seconds = Math.floor(Math.max(0, ms) / 1000);
	return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
		.map(value => String(value).padStart(2, "0")).join(":");
}

export default function (pi: ExtensionAPI) {
	let state: TimingEntry = { sessionStartTime: Date.now(), totalWorkingTime: 0, totalStreamingTime: 0 };
	let turnStart: number | undefined;
	let streamStart: number | undefined;
	let outputTokens = 0;
	let timer: ReturnType<typeof setInterval> | undefined;
	let requestRender: (() => void) | undefined;

	function persist() { pi.appendEntry("pi-time-tracker", { ...state }); }
	function stopTimer() {
		if (timer !== undefined) clearInterval(timer);
		timer = undefined;
		requestRender = undefined;
	}
	function restore(ctx: ExtensionContext) {
		stopTimer();
		turnStart = undefined;
		streamStart = undefined;
		state = { sessionStartTime: Date.now(), totalWorkingTime: 0, totalStreamingTime: 0 };
		outputTokens = 0;
		let restored = false;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "message" && entry.message.role === "assistant") outputTokens += entry.message.usage.output;
			if (entry.type !== "custom" || entry.customType !== "pi-time-tracker") continue;
			const data = entry.data as Partial<TimingEntry> | null;
			if (!data || !Number.isFinite(data.sessionStartTime) || !Number.isFinite(data.totalWorkingTime)
				|| (data.sessionStartTime ?? -1) < 0 || (data.totalWorkingTime ?? -1) < 0) continue;
			state = {
				sessionStartTime: data.sessionStartTime!, totalWorkingTime: data.totalWorkingTime!,
				totalStreamingTime: Number.isFinite(data.totalStreamingTime) && data.totalStreamingTime! >= 0 ? data.totalStreamingTime! : 0,
			};
			restored = true;
		}
		if (!restored) persist();
		if (ctx.mode !== "tui") return;
		ctx.ui.setWidget("pi-time-tracker", (tui, theme) => {
			requestRender = () => tui.requestRender();
			timer = setInterval(() => tui.requestRender(), 1000);
			timer.unref();
			return {
				invalidate() {},
				dispose: stopTimer,
				render(width: number) {
					const now = Date.now();
					const elapsed = Math.max(0, now - state.sessionStartTime);
					const working = state.totalWorkingTime + (turnStart === undefined ? 0 : Math.max(0, now - turnStart));
					const streaming = state.totalStreamingTime + (streamStart === undefined ? 0 : Math.max(0, now - streamStart));
					const start = new Date(state.sessionStartTime).toLocaleTimeString();
					const tps = streaming > 0 && outputTokens > 0 ? `  🚀 ${(outputTokens / (streaming / 1000)).toFixed(1)} tok/s` : "";
					return [truncateToWidth(theme.fg("dim", `⏱ ${formatTime(elapsed)} (started ${start})  ⚙ ${formatTime(working)}  💤 ${formatTime(elapsed - working)}${tps}`), width)];
				},
			};
		}, { placement: "belowEditor" });
	}
	function finishStream() {
		if (streamStart === undefined) return;
		state.totalStreamingTime += Math.max(0, Date.now() - streamStart);
		streamStart = undefined;
	}
	function finishTurn() {
		if (turnStart === undefined) return;
		finishStream();
		state.totalWorkingTime += Math.max(0, Date.now() - turnStart);
		turnStart = undefined;
		persist();
		requestRender?.();
	}

	pi.on("session_start", (_event, ctx) => restore(ctx));
	pi.on("session_tree", (_event, ctx) => restore(ctx));
	pi.on("turn_start", () => { turnStart ??= Date.now(); });
	pi.on("turn_end", finishTurn);
	pi.on("agent_settled", finishTurn);
	pi.on("message_start", event => { if (event.message.role === "assistant") streamStart ??= Date.now(); });
	pi.on("message_end", (event, ctx) => {
		if (event.message.role !== "assistant") return;
		finishStream();
		outputTokens = ctx.sessionManager.getBranch().reduce((total, entry) =>
			total + (entry.type === "message" && entry.message.role === "assistant" ? entry.message.usage.output : 0), 0);
		requestRender?.();
	});
	pi.on("session_shutdown", (_event, ctx) => {
		finishTurn();
		stopTimer();
		if (ctx.mode === "tui") ctx.ui.setWidget("pi-time-tracker", undefined);
	});
}

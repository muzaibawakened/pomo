import { monday, offsetDay } from "./calendar.ts";
import type { SessionRecord, State } from "./model.ts";

type Data = Pick<State, "history" | "legacy">;
export function summary(data: Data, from = "", through = "9999-12-31") {
  let activeMs = 0,
    finished = 0,
    quits = 0;
  for (const r of data.history) {
    if (r.mode !== "focus" || r.day < from || r.day > through) continue;
    if (r.outcome === "completed") finished++;
    else if (r.outcome === "quit") quits++;
    else continue;
    activeMs += r.activeMs;
  }
  const old = data.legacy;
  if (old && old.date >= from && old.date <= through) {
    finished += old.completedSessions;
    activeMs += old.focusedMinutes * 60_000;
  }
  return { activeMs, finished, quits };
}

export function formatTime(ms: number) {
  if (ms > 0 && ms < 60_000) return "<1m";
  const minutes = Math.floor(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

export function verdict(data: Data, today: string) {
  const end = offsetDay(monday(today), -1);
  const start = monday(end);
  const { activeMs, finished, quits } = summary(data, start, end);
  const text =
    finished || quits || activeMs
      ? `${formatTime(activeMs)} of focus, ${finished} finished ${
          finished === 1 ? "session" : "sessions"
        } and ${quits} deliberate ${quits === 1 ? "quit" : "quits"}. ${
          finished ? "Those finishes count." : "There’s room for a finish this week."
        }`
      : "Not enough recorded focus data for a verdict.";
  return { start, end, text };
}
export function claimVerdict(state: State, today: string): State {
  const week = monday(today);
  return state.profile && week > state.verdictWeek ? { ...state, verdictWeek: week } : state;
}

const lines = {
  "Instant surrender": [
    "Even the warm-up wants a warm-up.",
    "The opening credits are still rolling.",
    "That focus session was a trailer.",
  ],
  "Early escape": [
    "Your attention found the emergency exit.",
    "That was a very committed intermission.",
    "The timer had barely unpacked.",
  ],
  "Mid-session quit": [
    "Plot twist. The timer was rooting for you.",
    "A strong opening, an unexpected exit.",
    "Your focus left on a cliffhanger.",
  ],
  "Almost made it": [
    "You could see the finish line from there.",
    "So close the credits had started.",
    "That last stretch is keeping your seat.",
  ],
};
export function roast(activeMs: number, plannedMs: number, id: string) {
  const category =
    activeMs < 120_000
      ? "Instant surrender"
      : activeMs < 600_000
        ? "Early escape"
        : activeMs < plannedMs * 0.8
          ? "Mid-session quit"
          : "Almost made it";
  let hash = 0;
  for (const c of id) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return { category, line: lines[category][hash % lines[category].length] };
}
export function dailyQuits(history: SessionRecord[], day: string) {
  return history
    .filter((r) => r.mode === "focus" && r.outcome === "quit" && r.day === day)
    .sort((a, b) => a.endedAt - b.endedAt)
    .map((r, i) => ({
      id: r.id,
      label: `Quit at ${r.localTime}.${i ? " Again." : ""}`,
      ...roast(r.activeMs, r.plannedMs, r.id),
    }));
}

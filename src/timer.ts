import { clockTime, dayKey } from "./calendar.ts";
import { summary } from "./analytics.ts";
import type { ActiveTimer, Mode, Outcome, SessionRecord, State, Timer } from "./model.ts";

export type TimerAction =
  | { type: "start"; id: string }
  | {
      type: "resume" | "pause" | "expire" | "quit" | "skip" | "reset";
    }
  | { type: "mode"; mode: Mode };

export function remaining(timer: ActiveTimer, now: number) {
  return timer.phase === "paused"
    ? timer.remainingMs
    : Math.max(0, Math.min(timer.remainingMs, timer.deadline - now));
}
function withTimer(state: State, timer: Timer): State {
  return { ...state, timer, timerRevision: state.timerRevision + 1 };
}
function close(
  state: State,
  timer: ActiveTimer,
  outcome: Outcome,
  endedAt: number,
  nextMode = timer.mode,
): State {
  const next = withTimer(state, {
    phase: outcome === "completed" ? "completed" : "idle",
    mode: nextMode,
  });
  if (state.history.some((r) => r.id === timer.id)) return next;
  const record: SessionRecord = {
    id: timer.id,
    mode: timer.mode,
    plannedMs: timer.plannedMs,
    startedAt: timer.startedAt,
    activeMs:
      outcome === "completed" ? timer.plannedMs : timer.plannedMs - remaining(timer, endedAt),
    endedAt,
    day: dayKey(endedAt),
    localTime: clockTime(endedAt),
    outcome,
  };
  return { ...next, history: [...state.history, record] };
}
export function transition(
  state: State,
  revision: number,
  action: TimerAction,
  now: number,
): State {
  if (state.timerRevision !== revision) return state;
  const timer = state.timer;
  if (timer.phase === "running") {
    if (action.type !== "expire" && action.type !== "pause" && action.type !== "quit") return state;
    if (now >= timer.deadline) return close(state, timer, "completed", timer.deadline);
    if (action.type === "quit") return close(state, timer, "quit", now);
    if (action.type === "pause") {
      const { deadline: _deadline, ...session } = timer;
      return withTimer(state, {
        ...session,
        phase: "paused",
        remainingMs: remaining(timer, now),
      });
    }
    return state;
  }
  if (action.type === "start" && timer.phase !== "paused") {
    if (state.history.some((r) => r.id === action.id)) return state;
    const plannedMs = state.settings.durations[timer.mode] * 60_000;
    return withTimer(state, {
      phase: "running",
      mode: timer.mode,
      id: action.id,
      startedAt: now,
      plannedMs,
      remainingMs: plannedMs,
      deadline: now + plannedMs,
    });
  }
  if (action.type === "resume" && timer.phase === "paused") {
    return withTimer(state, {
      ...timer,
      phase: "running",
      deadline: now + timer.remainingMs,
    });
  }
  if (action.type !== "mode" && action.type !== "reset" && action.type !== "skip") return state;
  let mode = timer.mode;
  if (action.type === "mode") mode = action.mode;
  if (action.type === "skip") {
    const day = dayKey(now);
    const count = summary(state, day, day).finished;
    mode = mode === "focus" ? (count > 0 && count % 4 === 0 ? "long" : "short") : "focus";
  }
  if (timer.phase === "paused") {
    const outcome =
      action.type === "mode" ? "discarded" : action.type === "skip" ? "skipped" : "reset";
    return close(state, timer, outcome, now, mode);
  }
  return withTimer(state, { phase: "idle", mode });
}

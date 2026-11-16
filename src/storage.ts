import { dayKey, monday, validDay } from "./calendar.ts";
import {
  defaults,
  modes,
  type LegacyDay,
  type Mode,
  type SessionRecord,
  type Settings,
  type State,
  type Task,
  type Timer,
} from "./model.ts";

export const STORAGE_KEY = "pomo.state.v3";
type Reader = Pick<Storage, "getItem">;
const object = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const integer = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
const stamp = (v: unknown): v is number => integer(v, 253402300799999);
const validId = (v: unknown): v is string => typeof v === "string" && !!v.trim();
const isMode = (v: unknown): v is Mode => modes.some((mode) => mode === v);
const planned = (v: unknown): v is number => integer(v, 180 * 60_000) && v > 0;
function settingsOf(value: unknown): Settings {
  const s = object(value),
    input = object(s.durations);
  const durations = { ...defaults.durations };
  for (const mode of modes) {
    const value = input[mode];
    if (integer(value, 180) && value > 0) durations[mode] = value;
  }
  return {
    durations,
    sound: typeof s.sound === "boolean" ? s.sound : defaults.sound,
    interactionSounds:
      typeof s.interactionSounds === "boolean" ? s.interactionSounds : s.sound !== false,
    volume: integer(s.volume, 100) ? s.volume : defaults.volume,
    notifications: typeof s.notifications === "boolean" ? s.notifications : defaults.notifications,
  };
}
function legacyOf(value: unknown): LegacyDay | null {
  const d = object(value);
  return validDay(d.date) && integer(d.completedSessions) && integer(d.focusedMinutes)
    ? {
        date: d.date,
        completedSessions: d.completedSessions,
        focusedMinutes: d.focusedMinutes,
      }
    : null;
}
function tasksOf(value: unknown): Task[] {
  if (!Array.isArray(value)) return [];
  const result: Task[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    const t = object(entry);
    if (!validId(t.id) || !validId(t.title) || typeof t.done !== "boolean" || ids.has(t.id))
      continue;
    result.push({ id: t.id, title: t.title, done: t.done });
    ids.add(t.id);
  }
  return result;
}
function sessionOf(s: Record<string, unknown>) {
  if (
    !validId(s.id) ||
    !isMode(s.mode) ||
    !planned(s.plannedMs) ||
    !(s.startedAt === null || stamp(s.startedAt))
  )
    return null;
  return {
    id: s.id,
    mode: s.mode,
    plannedMs: s.plannedMs,
    startedAt: s.startedAt,
  };
}
function historyOf(value: unknown): SessionRecord[] {
  const result: SessionRecord[] = [];
  if (!Array.isArray(value)) return result;
  const ids = new Set<string>();
  for (const entry of value) {
    const r = object(entry),
      session = sessionOf(r);
    if (
      !session ||
      ids.has(session.id) ||
      !stamp(r.endedAt) ||
      !integer(r.activeMs, session.plannedMs) ||
      !validDay(r.day) ||
      typeof r.localTime !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.localTime)
    )
      continue;
    const outcome = r.outcome;
    if (
      outcome !== "completed" &&
      outcome !== "quit" &&
      outcome !== "reset" &&
      outcome !== "skipped" &&
      outcome !== "discarded"
    )
      continue;
    if (outcome === "completed" && r.activeMs !== session.plannedMs) continue;
    result.push({
      ...session,
      outcome,
      activeMs: r.activeMs,
      endedAt: r.endedAt,
      day: r.day,
      localTime: r.localTime,
    });
    ids.add(session.id);
  }
  return result;
}
function timerOf(value: unknown, history: SessionRecord[]): Timer {
  const t = object(value),
    mode = isMode(t.mode) ? t.mode : "focus";
  const idle = { phase: "idle" as const, mode };
  if (t.phase === "completed") return { phase: "completed", mode };
  const session = sessionOf(t);
  if (!session) return idle;
  const terminal = history.find((r) => r.id === session.id);
  if (terminal)
    return {
      phase: terminal.outcome === "completed" ? "completed" : "idle",
      mode: terminal.mode,
    };
  if (!integer(t.remainingMs, session.plannedMs) || t.remainingMs === 0) return idle;
  if (t.phase === "running" && stamp(t.deadline))
    return {
      ...session,
      phase: "running",
      remainingMs: t.remainingMs,
      deadline: t.deadline,
    };
  if (t.phase === "paused") return { ...session, phase: "paused", remainingMs: t.remainingMs };
  return idle;
}

export function decode(data: unknown, now: number): State {
  const d = object(data),
    name = object(d.profile).name,
    tasks = tasksOf(d.tasks),
    history = historyOf(d.history);
  return {
    version: 3,
    profile: validId(name) ? { name: name.trim() } : null,
    tasks,
    activeTaskId: tasks.find((t) => t.id === d.activeTaskId && !t.done)?.id ?? null,
    settings: settingsOf(d.settings),
    history,
    timer: timerOf(d.timer, history),
    timerRevision: integer(d.timerRevision) ? d.timerRevision : 0,
    legacy: legacyOf(d.legacy),
    verdictWeek: validDay(d.verdictWeek) ? monday(d.verdictWeek) : monday(dayKey(now)),
  };
}
export function migrate(storage: Reader, now: number, id: string): State {
  function read(key: string): unknown {
    const raw = storage.getItem(`pomo.${key}.v1`);
    try {
      return raw === null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const legacy = legacyOf(read("daily-stats"));
  const state = decode(
    {
      profile: read("profile"),
      settings: read("settings"),
      tasks: read("tasks"),
      activeTaskId: read("active-task"),
      legacy,
      verdictWeek: legacy?.date,
    },
    now,
  );
  const old = object(read("timer")),
    mode = isMode(old.mode) ? old.mode : "focus";
  const plannedMs = state.settings.durations[mode] * 60_000;
  const session = { id, mode, plannedMs, startedAt: null };
  state.timer = { phase: "idle", mode };
  if (old.isRunning === true && stamp(old.deadline)) {
    const left = Math.min(plannedMs, Math.max(1, old.deadline - now));
    state.timer = {
      ...session,
      phase: "running",
      deadline: old.deadline,
      remainingMs: left,
    };
  } else if (old.isRunning === false && integer(old.secondsLeft, plannedMs / 1000)) {
    if (old.secondsLeft === 0) state.timer = { phase: "completed", mode };
    else if (old.secondsLeft * 1000 < plannedMs)
      state.timer = {
        ...session,
        phase: "paused",
        remainingMs: old.secondsLeft * 1000,
      };
  }
  return state;
}

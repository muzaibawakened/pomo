export type Mode = "focus" | "short" | "long";
export const modes: Mode[] = ["focus", "short", "long"];
export type Task = { id: string; title: string; done: boolean };
export type Settings = {
  durations: Record<Mode, number>;
  sound: boolean;
  notifications: boolean;
};
export const defaults: Settings = {
  durations: { focus: 25, short: 5, long: 15 },
  sound: true,
  notifications: false,
};
export type Outcome = "completed" | "quit" | "reset" | "skipped" | "discarded";

export type Session = {
  id: string;
  mode: Mode;
  plannedMs: number;
  startedAt: number | null; // V2 never stored the original start.
};
export type ActiveTimer = Session & { remainingMs: number } & (
    | { phase: "paused" }
    | { phase: "running"; deadline: number }
  );
export type Timer = { phase: "idle" | "completed"; mode: Mode } | ActiveTimer;
export type SessionRecord = Session & {
  outcome: Outcome;
  activeMs: number;
  endedAt: number;
  day: string;
  localTime: string;
};
export type LegacyDay = {
  date: string;
  completedSessions: number;
  focusedMinutes: number;
};
export type State = {
  version: 3;
  profile: { name: string } | null;
  settings: Settings;
  tasks: Task[];
  activeTaskId: string | null;
  timer: Timer;
  timerRevision: number;
  history: SessionRecord[];
  legacy: LegacyDay | null;
  verdictWeek: string;
};
export function makeId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

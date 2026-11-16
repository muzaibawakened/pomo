import { dayKey } from "./calendar.ts";
import { claimVerdict } from "./analytics.ts";
import { makeId, type SessionRecord, type State } from "./model.ts";
import { decode, migrate, STORAGE_KEY } from "./storage.ts";
import { transition, type TimerAction } from "./timer.ts";

type Snapshot = { data: State; warning: string };
type Result = { changed?: boolean; record?: SessionRecord; showVerdict?: boolean };
type Lock = <T>(job: () => T) => Promise<T>;
const volatile =
  "Changes are in memory only. Keep this tab open, allow site storage or free up space, then retry.";

export function createStore(access: () => Storage, lock: Lock) {
  let lastRaw: string | null = null;
  let memoryOnly = false;
  let baseRead = false;
  let warning = "";
  let data: State;
  const listeners = new Set<() => void>();
  function read(raw: string | null, now: number): State {
    if (raw === null) return migrate(access(), now, makeId());
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 3) {
      throw new Error("Unrecognized local data");
    }
    return decode(parsed, now);
  }
  try {
    lastRaw = access().getItem(STORAGE_KEY);
    data = read(lastRaw, Date.now());
    baseRead = true;
  } catch {
    data = decode({}, Date.now());
    warning = volatile + (lastRaw ? " The unreadable snapshot is still in storage." : "");
    memoryOnly = true;
  }
  let snapshot: Snapshot = { data, warning };
  function publish() {
    if (snapshot.data === data && snapshot.warning === warning) return;
    snapshot = { data, warning };
    listeners.forEach((fn) => fn());
  }
  function refresh() {
    if (memoryOnly) return;
    try {
      const raw = access().getItem(STORAGE_KEY);
      if (raw !== lastRaw) {
        data = read(raw, Date.now());
        lastRaw = raw;
      }
    } catch {
      memoryOnly = true;
      warning = volatile;
    }
  }
  function commit<T>(job: (current: State) => [State, T]): Promise<T> {
    const apply = () => {
      refresh();
      const [next, result] = job(data);
      if (!memoryOnly && (next !== data || lastRaw === null)) {
        try {
          const raw = JSON.stringify(next);
          access().setItem(STORAGE_KEY, raw);
          lastRaw = raw;
        } catch {
          warning = volatile;
          memoryOnly = true;
        }
      }
      data = next;
      publish();
      return result;
    };
    return locked(apply);
  }
  async function locked<T>(job: () => T): Promise<T> {
    let entered = false;
    try {
      return await lock(() => {
        entered = true;
        return job();
      });
    } catch (error) {
      if (entered) throw error;
      // Browsers can expose Web Locks but deny access in a restricted context.
      memoryOnly = true;
      warning = volatile;
      return job();
    }
  }
  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSnapshot: () => snapshot,
    sync() {
      refresh();
      publish();
    },
    retry() {
      return locked(() => {
        if (!memoryOnly) return;
        try {
          const disk = access();
          const raw = disk.getItem(STORAGE_KEY);
          const oldKeys = ["profile", "settings", "tasks", "active-task", "timer", "daily-stats"];
          const unknownBase =
            !baseRead &&
            (raw !== null || oldKeys.some((k) => disk.getItem(`pomo.${k}.v1`) !== null));
          if (raw !== lastRaw || unknownBase) {
            warning =
              "Other saved data exists. This tab’s changes are in memory only. Keep this tab open to keep using them.";
          } else {
            const encoded = JSON.stringify(data);
            disk.setItem(STORAGE_KEY, encoded);
            lastRaw = encoded;
            memoryOnly = false;
            baseRead = true;
            warning = "";
          }
        } catch {
          warning = volatile;
        }
        publish();
      });
    },
    visit() {
      return commit<Result>((s) => {
        const next = claimVerdict(s, dayKey(Date.now()));
        return [next, { showVerdict: next !== s }];
      });
    },
    timer(revision: number, action: TimerAction, at = Date.now()) {
      return commit<Result>((s) => {
        const next = transition(s, revision, action, at);
        const record =
          next.history.length > s.history.length
            ? next.history[next.history.length - 1]
            : undefined;
        return [next, { record, changed: next !== s }];
      });
    },
    edit(revision: number, update: (current: State) => State) {
      return commit((s) =>
        s.timer.phase === "running" || s.timerRevision !== revision
          ? [s, false]
          : [update(s), true],
      );
    },
  };
}

export const store = createStore(
  () => window.localStorage,
  (job) =>
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(STORAGE_KEY, job)
      : Promise.resolve(job()),
);

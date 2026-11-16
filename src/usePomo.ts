import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { dayKey } from "./calendar.ts";
import type { SessionRecord } from "./model.ts";
import { store } from "./store.ts";
import { remaining, type TimerAction } from "./timer.ts";

export function usePomo(onRecord: (record: SessionRecord) => void) {
  const { data, warning } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { timer, timerRevision } = data;
  const [today, setToday] = useState(() => dayKey(Date.now()));
  const [verdictOpen, setVerdictOpen] = useState(false);
  const send = useCallback(
    async (action: TimerAction) => {
      const { record } = await store.timer(timerRevision, action);
      if (record) onRecord(record);
    },
    [timerRevision, onRecord],
  );

  const readSeconds = useCallback(() => {
    if (timer.phase === "running" || timer.phase === "paused")
      return Math.ceil(remaining(timer, Date.now()) / 1000);
    return timer.phase === "completed" ? 0 : data.settings.durations[timer.mode] * 60;
  }, [timer, data.settings.durations]);
  const subscribeClock = useCallback(
    (changed: () => void) => {
      if (timer.phase !== "running") return () => {};
      let timeout: number;
      let finalizing = false;
      const tick = () => {
        window.clearTimeout(timeout);
        const left = remaining(timer, Date.now());
        changed(); // useSyncExternalStore only renders on a different displayed second.
        if (left > 0) timeout = window.setTimeout(tick, left % 1000 || 1000);
        else if (!finalizing) {
          finalizing = true;
          void send({ type: "expire" });
        }
      };
      tick();
      document.addEventListener("visibilitychange", tick);
      window.addEventListener("pageshow", tick);
      return () => {
        window.clearTimeout(timeout);
        document.removeEventListener("visibilitychange", tick);
        window.removeEventListener("pageshow", tick);
      };
    },
    [timer, send],
  );
  const secondsLeft = useSyncExternalStore(subscribeClock, readSeconds);
  useEffect(() => {
    let timeout: number;
    const reconcile = () => {
      store.sync();
      const now = new Date();
      setToday(dayKey(now));
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(reconcile, midnight.getTime() - now.getTime());
    };
    reconcile();
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("pageshow", reconcile);
    window.addEventListener("focus", reconcile);
    window.addEventListener("storage", reconcile);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("pageshow", reconcile);
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("storage", reconcile);
    };
  }, []);
  useEffect(() => {
    void store.visit().then(({ showVerdict }) => {
      if (showVerdict) setVerdictOpen(true);
    });
  }, [today, data.profile?.name]);
  return {
    data,
    warning,
    today,
    secondsLeft,
    send,
    verdictOpen,
    dismissVerdict: () => setVerdictOpen(false),
  };
}

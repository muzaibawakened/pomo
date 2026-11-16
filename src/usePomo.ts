import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { dayKey } from "./calendar.ts";
import type { SessionRecord } from "./model.ts";
import { unlockSound, playCue, playFinish } from "./sound";
import { store } from "./store.ts";
import { type TimerAction } from "./timer.ts";

export function usePomo(onRecord: (record: SessionRecord) => void) {
  const { data, warning } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { timerRevision } = data;
  const [today, setToday] = useState(() => dayKey(Date.now()));
  const [verdictOpen, setVerdictOpen] = useState(false);
  const send = useCallback(
    async (action: TimerAction) => {
      if (action.type !== "expire") unlockSound();
      const { record, changed } = await store.timer(timerRevision, action);
      if (record) onRecord(record);
      if (
        !changed ||
        action.type === "expire" ||
        record?.outcome === "completed" ||
        record?.outcome === "quit"
      )
        return;
      if (action.type === "start" || action.type === "pause" || action.type === "resume")
        playCue(action.type);
      else playCue("tap");
    },
    [timerRevision, onRecord],
  );

  useEffect(() => {
    let timeout: number;
    const reconcile = () => {
      const previousCount = store.getSnapshot().data.history.length;
      store.sync();
      const history = store.getSnapshot().data.history;
      if (history.length > previousCount) playFinish(history[history.length - 1], false);
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
  const running = data.timer.phase === "running";
  useEffect(() => {
    void store.visit().then(({ showVerdict }) => {
      if (showVerdict) setVerdictOpen(true);
    });
  }, [today, data.profile?.name, running]);
  return {
    data,
    warning,
    today,
    send,
    verdictOpen,
    dismissVerdict: () => setVerdictOpen(false),
  };
}

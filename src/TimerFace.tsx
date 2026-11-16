import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Timer } from "./model";
import { remaining, type TimerAction } from "./timer";

export function TimerFace({
  timer,
  totalSeconds,
  send,
  label,
}: {
  timer: Timer;
  totalSeconds: number;
  send: (action: TimerAction) => Promise<void>;
  label: string;
}) {
  const readSeconds = useCallback(() => {
    if (timer.phase === "running" || timer.phase === "paused")
      return Math.ceil(remaining(timer, Date.now()) / 1000);
    return timer.phase === "completed" ? 0 : totalSeconds;
  }, [timer, totalSeconds]);
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

  const mode = timer.mode;
  const progress = Math.max(0, 1 - secondsLeft / totalSeconds);
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  const sessionStatus = {
    idle: "Ready",
    paused: "Paused",
    running: "In progress",
    completed: "Complete",
  }[timer.phase];
  useEffect(() => {
    document.title =
      timer.phase === "completed"
        ? `${mode === "focus" ? "Focus" : "Break"} complete · pomo.`
        : `${minutes}:${seconds} · pomo.`;
  }, [minutes, seconds, timer.phase, mode]);

  return (
    <div className="ring-stage">
      <div className={`timer-orb timer-orb-${mode}`}>
        <svg className="timer-ring" viewBox="0 0 300 300" aria-hidden="true">
          <circle
            className="timer-ring-track"
            cx="150"
            cy="150"
            r="135"
            fill="none"
            strokeWidth="3.5"
          />
          <circle
            className="timer-ring-progress"
            cx="150"
            cy="150"
            r="135"
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 135}
            strokeDashoffset={2 * Math.PI * 135 * (1 - progress)}
          />
        </svg>
        <div className="timer-content" key={mode}>
          <p className="dial-status">
            <strong>{label}</strong>
            <span aria-hidden="true">·</span>
            {sessionStatus}
          </p>
          <div
            className="timer-digits"
            role="timer"
            aria-live="off"
            aria-label={`${minutes} minutes and ${seconds} seconds remaining`}
          >
            <span className="timer-minutes" data-wide={minutes.length > 2}>
              {minutes}
            </span>
            <span className="timer-seconds">{seconds}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

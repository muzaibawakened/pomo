import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createHold, HOLD_MS, holdKey } from "./hold.ts";

export function HoldToQuit({ onQuit, prompt }: { onQuit: () => void; prompt: string }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const machine = useRef(createHold());
  const input = useRef<number | string | null>(null);
  const frame = useRef(0);
  const button = useRef<HTMLButtonElement>(null);
  function stop() {
    cancelAnimationFrame(frame.current);
    const owner = input.current;
    input.current = null;
    if (typeof owner === "number" && button.current?.hasPointerCapture(owner))
      button.current.releasePointerCapture(owner);
    setProgress(null);
  }
  function cancel() {
    if (input.current === null) return;
    machine.current.cancel();
    stop();
    setStatus("Quit cancelled. Timer continues.");
  }
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
      document.removeEventListener("visibilitychange", visibility);
      cancelAnimationFrame(frame.current);
      machine.current.cancel();
      input.current = null;
    };
  }, []);
  function sample() {
    const owner = input.current;
    if (owner === null) return;
    const now = performance.now();
    const continuous =
      !document.hidden &&
      document.hasFocus() &&
      (typeof owner === "number"
        ? !!button.current?.hasPointerCapture(owner)
        : document.activeElement === button.current);
    const state = machine.current.sample(now, continuous);
    if (state === "confirmed") {
      stop();
      onQuit();
    } else if (state === "holding") {
      setProgress(machine.current.progress(now));
      frame.current = requestAnimationFrame(sample);
    } else cancel();
  }
  function begin(owner: number | string) {
    if (input.current !== null || document.hidden || !machine.current.begin(performance.now()))
      return;
    input.current = owner;
    setProgress(0);
    setStatus(prompt);
    frame.current = requestAnimationFrame(sample);
  }
  function release() {
    cancelAnimationFrame(frame.current);
    sample();
    cancel();
  }
  function inside(e: ReactPointerEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className="round-control quit-control"
        aria-label="Hold to quit for 1.8 seconds"
        aria-pressed={progress !== null}
        onPointerDown={(e) => {
          if (!e.isPrimary || e.button !== 0 || input.current !== null) {
            cancel();
            return;
          }
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          begin(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (e.pointerId === input.current && (!inside(e) || !(e.buttons & 1))) cancel();
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onPointerLeave={(e) => {
          if (e.pointerId === input.current) cancel();
        }}
        onPointerUp={(e) => {
          if (e.pointerId === input.current) {
            if (inside(e)) release();
            else cancel();
          }
        }}
        onBlur={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            cancel();
            return;
          }
          if (!holdKey(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat) begin(e.key);
        }}
        onKeyUp={(e) => {
          if (holdKey(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            if (input.current === e.key) release();
          }
        }}
      >
        {progress === null ? (
          <>
            Hold to
            <br />
            quit
          </>
        ) : (
          `${(((1 - progress) * HOLD_MS) / 1000).toFixed(1)}s`
        )}
      </button>
      <span role="status" className={progress === null ? "sr-only" : "hold-feedback"}>
        {status}
      </span>
    </>
  );
}

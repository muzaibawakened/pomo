import { createPortal } from "react-dom";
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { beginHoldSound } from "./sound";
import { createHold, HOLD_MS, holdKey } from "./hold.ts";

export function HoldToQuit({
  onQuit,
  getPrompt,
  readoutHost,
}: {
  readoutHost: RefObject<HTMLDivElement | null>;
  onQuit: () => void;
  getPrompt: () => string;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const machine = useRef(createHold());
  const input = useRef<number | string | null>(null);
  const frame = useRef(0);
  const stopTone = useRef<(() => void) | undefined>(undefined);
  const button = useRef<HTMLButtonElement>(null);
  function stop() {
    stopTone.current?.();
    stopTone.current = undefined;
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
      stopTone.current?.();
      stopTone.current = undefined;
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
      setProgress(Math.floor(machine.current.progress(now) * 18) / 18);
      frame.current = requestAnimationFrame(sample);
    } else cancel();
  }
  function begin(owner: number | string) {
    if (input.current !== null || document.hidden || !machine.current.begin(performance.now()))
      return;
    input.current = owner;
    stopTone.current = beginHoldSound();
    setProgress(0);
    setStatus(getPrompt());
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
        data-own-sound
        ref={button}
        type="button"
        className="quit-control"
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
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect
            x="3"
            y="3"
            width="10"
            height="10"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        Hold to quit
      </button>
      <span role="status" className="sr-only">
        {status}
      </span>
      {progress !== null &&
        readoutHost.current &&
        createPortal(
          <div className="quit-readout">
            <span className="quit-instruction">Release to cancel</span>
            <strong className="quit-remaining">
              {(((1 - progress) * HOLD_MS) / 1000).toFixed(1)}
              <small>s</small>
            </strong>
            <div
              role="progressbar"
              aria-label="Hold to quit"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="quit-track"
            >
              <span style={{ transform: `scaleX(${progress})` }} />
            </div>
            <p>{status}</p>
          </div>,
          readoutHost.current,
        )}
    </>
  );
}

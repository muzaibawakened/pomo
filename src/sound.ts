import { store } from "./store";
import type { SessionRecord } from "./model";
import { HOLD_MS } from "./hold";

type Cue = "tap" | "start" | "resume" | "pause" | "task" | "quit" | "focusFinish" | "breakFinish";
type Note = readonly [frequency: number, onset: number, decay: number, level: number];
const score: Record<Cue, readonly Note[]> = {
  tap: [[880, 0, 0.048, 0.035]],
  start: [
    [392, 0, 0.21, 0.085],
    [587.33, 0.075, 0.29, 0.08],
  ],
  resume: [
    [493.88, 0, 0.1, 0.065],
    [587.33, 0.048, 0.16, 0.06],
  ],
  pause: [
    [440, 0, 0.13, 0.065],
    [329.63, 0.075, 0.16, 0.055],
  ],
  task: [
    [784, 0, 0.13, 0.07],
    [987.77, 0.055, 0.19, 0.05],
  ],
  quit: [[246.94, 0, 0.24, 0.085]],
  focusFinish: [
    [659.25, 0, 0.58, 0.24],
    [987.77, 0.235, 0.85, 0.2],
  ],
  breakFinish: [
    [783.99, 0, 0.38, 0.2],
    [587.33, 0.16, 0.55, 0.18],
  ],
};
let context: AudioContext | undefined;
let output: GainNode | undefined;
let glass: PeriodicWave | undefined;
let lastTap = -Infinity;
let resume: Promise<void> | undefined;
const prefs = () => store.getSnapshot().data.settings;
const gainFor = (volume: number) => (volume / 100) ** 1.5;

let volume = prefs().volume;
store.subscribe(() => {
  const next = prefs().volume;
  if (next === volume) return;
  volume = next;
  if (context && output) output.gain.setTargetAtTime(gainFor(next), context.currentTime, 0.012);
});

// Called synchronously from user input. Only schedule after resume succeeds.
export function unlockSound(preview = false) {
  const settings = prefs();
  if (!settings.volume || !(preview || settings.sound || settings.interactionSounds)) return;
  try {
    if (!context || context.state === "closed") {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      const master = ctx.createGain(),
        limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 10;
      master.gain.value = gainFor(settings.volume);
      // A quiet upper partial gives the chimes a glassy attack on small speakers.
      glass = ctx.createPeriodicWave(
        new Float32Array(5),
        new Float32Array([0, 1, 0.17, 0.025, 0.045]),
      );
      master.connect(limiter).connect(ctx.destination);
      context = ctx;
      output = master;
    }
    if (context.state !== "running" && !resume) {
      resume = context
        .resume()
        .catch(() => {})
        .finally(() => {
          resume = undefined;
        });
    }
  } catch {
    /* An unavailable audio device must never block the timer. */
  }
}

function whenReady(play: (ctx: AudioContext, bus: GainNode) => void) {
  const ctx = context,
    bus = output;
  if (!ctx || !bus) return;
  const run = () => {
    if (ctx.state !== "running") return;
    play(ctx, bus);
  };
  if (ctx.state === "running") run();
  else if (resume) {
    const requestedAt = performance.now();
    void resume.then(() => {
      if (performance.now() - requestedAt < 350) run();
    });
  }
}

function schedule(ctx: AudioContext, bus: GainNode, cue: Cue) {
  for (const [frequency, onset, decay, level] of score[cue]) {
    const at = ctx.currentTime + onset + 0.004;
    const osc = ctx.createOscillator(),
      envelope = ctx.createGain();
    if (glass && cue !== "tap" && cue !== "quit") osc.setPeriodicWave(glass);
    osc.frequency.setValueAtTime(frequency, at);
    envelope.gain.setValueAtTime(0.00001, at);
    envelope.gain.exponentialRampToValueAtTime(level, at + 0.009);
    envelope.gain.exponentialRampToValueAtTime(0.00001, at + decay);
    osc.connect(envelope).connect(bus);
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
    };
    osc.start(at);
    osc.stop(at + decay + 0.005);
  }
}

export function playCue(cue: Cue, preview = false) {
  const finish = cue === "focusFinish" || cue === "breakFinish";
  const settings = prefs();
  if (!settings.volume || (!preview && !(finish ? settings.sound : settings.interactionSounds)))
    return;
  if (cue === "tap") {
    if (performance.now() - lastTap < 65) return;
    lastTap = performance.now();
  }
  whenReady((ctx, bus) => {
    schedule(ctx, bus, cue);
  });
}

// The tab that saves an expiry may have no audio permission. An armed peer can
// claim the chime when it receives the same record. Keep one receipt across reloads.
export function playFinish(record: SessionRecord, writer: boolean) {
  if (
    record.outcome !== "completed" ||
    !prefs().sound ||
    !prefs().volume ||
    Date.now() - record.endedAt > 30_000
  )
    return;
  whenReady((ctx, bus) => {
    const sound = () => {
      if (
        ctx.state !== "running" ||
        !prefs().sound ||
        !prefs().volume ||
        Date.now() - record.endedAt > 30_000
      )
        return;
      try {
        if (localStorage.getItem("pomo.last-chime") === record.id) return;
        localStorage.setItem("pomo.last-chime", record.id);
      } catch {
        if (!writer) return;
      }
      schedule(ctx, bus, record.mode === "focus" ? "focusFinish" : "breakFinish");
    };
    if (navigator.locks) {
      void navigator.locks
        .request("pomo.finish-chime", { ifAvailable: true }, (lock) => {
          if (lock) sound();
        })
        .catch(() => {
          if (writer) sound();
        });
    } else if (writer) sound();
  });
}

export function beginHoldSound() {
  unlockSound();
  let cancelled = false,
    release: (() => void) | undefined;
  if (prefs().interactionSounds && prefs().volume)
    whenReady((ctx, bus) => {
      if (cancelled) return;
      const osc = ctx.createOscillator(),
        envelope = ctx.createGain();
      const gate = ctx.createGain();
      const at = ctx.currentTime,
        end = at + HOLD_MS / 1000;
      osc.frequency.setValueAtTime(220, at);
      osc.frequency.exponentialRampToValueAtTime(349.23, end);
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(0.018, at + 0.08);
      envelope.gain.linearRampToValueAtTime(0.08, end);
      envelope.gain.linearRampToValueAtTime(0, end + 0.024);
      osc.connect(envelope).connect(gate).connect(bus);
      osc.onended = () => {
        osc.disconnect();
        envelope.disconnect();
        gate.disconnect();
      };
      osc.start(at);
      osc.stop(end + 0.03);
      release = () => {
        const time = ctx.currentTime;
        if (time >= end + 0.03) return;
        gate.gain.setValueAtTime(1, time);
        gate.gain.linearRampToValueAtTime(0, time + 0.018);
        osc.stop(time + 0.022);
      };
    });
  return () => {
    cancelled = true;
    release?.();
    release = undefined;
  };
}

export function previewChime() {
  unlockSound(true);
  playCue("focusFinish", true);
}

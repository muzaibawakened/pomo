export const HOLD_MS = 1800;
const MAX_SAMPLE_GAP = 250;
export const holdKey = (key: string) => key === " " || key === "Enter";
export type HoldState = "idle" | "holding" | "cancelled" | "confirmed";

export function createHold() {
  let state: HoldState = "idle",
    started = 0,
    sampled = 0;
  return {
    begin(now: number) {
      if (state === "holding") return false;
      started = sampled = now;
      state = "holding";
      return true;
    },
    cancel() {
      if (state === "holding") state = "cancelled";
      return state;
    },
    sample(now: number, continuous: boolean): HoldState {
      if (state !== "holding") return state;
      if (!continuous || now < sampled || now - sampled > MAX_SAMPLE_GAP) return this.cancel();
      sampled = now;
      if (now - started >= HOLD_MS) state = "confirmed";
      return state;
    },
    progress(now: number) {
      return Math.min(1, Math.max(0, (now - started) / HOLD_MS));
    },
  };
}

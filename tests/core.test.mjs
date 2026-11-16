import test from "node:test";
import assert from "node:assert/strict";
import { decode, migrate, STORAGE_KEY } from "../src/storage.ts";
import { createStore } from "../src/store.ts";
import { transition, remaining } from "../src/timer.ts";
import { createHold, holdKey } from "../src/hold.ts";
import { claimVerdict, dailyQuits, formatTime, roast, summary, verdict } from "../src/analytics.ts";
import { clockTime, dayKey, monday, weekDays } from "../src/calendar.ts";

process.env.TZ = "America/New_York";
const start = new Date(2025, 0, 6, 12).getTime();
const fresh = () => decode({ profile: { name: "M" } }, start);
const act = (s, action, now = start) => transition(s, s.timerRevision, action, now);
const running = () => act(fresh(), { type: "start", id: "one" });
function memory(entries = {}) {
  const map = new Map(Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
  };
}
const direct = (job) => Promise.resolve(job());

test("start locks one planned session and all ordinary timer actions", () => {
  const s = running();
  assert.equal(s.timer.plannedMs, 1_500_000);
  assert.equal(s.timer.deadline, start + 1_500_000);
  for (const action of [
    { type: "start", id: "two" },
    { type: "resume" },
    { type: "mode", mode: "long" },
    { type: "reset" },
    { type: "skip" },
  ]) {
    assert.equal(act(s, action), s);
  }
});
test("pause freezes fractional seconds; resume keeps ID, original plan and active time", () => {
  const paused = act(running(), { type: "pause" }, start + 10_275);
  assert.equal(paused.timer.phase, "paused");
  assert.equal("deadline" in paused.timer, false);
  assert.equal(remaining(paused.timer, start + 90_000), 1_489_725);
  const resumed = act(paused, { type: "resume" }, start + 200_000);
  const quit = act(resumed, { type: "quit" }, start + 205_100);
  assert.deepEqual(
    quit.history.map((r) => [r.id, r.activeMs, r.outcome]),
    [["one", 15_375, "quit"]],
  );
});
test("a paused departure has its own outcome; idle reset and skip do not create records", () => {
  const pause = act(running(), { type: "pause" }, start + 1);
  for (const [action, outcome] of [
    [{ type: "reset" }, "reset"],
    [{ type: "skip" }, "skipped"],
    [{ type: "mode", mode: "long" }, "discarded"],
  ]) {
    const next = act(pause, action);
    assert.equal(next.history[0].outcome, outcome);
    assert.deepEqual(summary(next), { activeMs: 0, finished: 0, quits: 0 });
    assert.deepEqual(act(fresh(), action).history, []);
  }
});
test("zero wins over pause or quit; recovery uses deadline day and closes exactly once", () => {
  const s = running();
  for (const type of ["pause", "quit", "expire"]) {
    const done = act(s, { type }, s.timer.deadline);
    assert.equal(done.timer.phase, "completed");
    assert.equal(done.history[0].outcome, "completed");
    const reload = decode(JSON.parse(JSON.stringify(s)), s.timer.deadline + 86_400_000);
    const late = act(reload, { type: "expire" }, s.timer.deadline + 86_400_000);
    assert.deepEqual(late.history, done.history);
    assert.equal(act(late, { type: "expire" }).history.length, 1);
    const partial = decode({ ...s, history: done.history }, start);
    assert.equal(partial.timer.phase, "completed");
    assert.equal(act(partial, { type: "pause" }).history.length, 1);
  }
});
test("stale callbacks cannot close a resumed segment or a newer session", () => {
  const s = running(),
    paused = act(s, { type: "pause" }, start + 100);
  const resumed = act(paused, { type: "resume" }, start + 1000);
  const newer = act(
    act(resumed, { type: "quit" }, start + 1100),
    { type: "start", id: "two" },
    start + 1200,
  );
  for (const state of [resumed, newer])
    for (const type of ["expire", "pause", "quit"]) {
      assert.equal(transition(state, s.timerRevision, { type }, start + 2_000_000), state);
    }
});
test("backwards clock bounds exclude time already banked in a previous segment", () => {
  const paused = act(running(), { type: "pause" }, start + 15_000);
  const resumed = act(paused, { type: "resume" }, start + 20_000);
  assert.equal(act(resumed, { type: "quit" }, start - 3_600_000).history[0].activeMs, 15_000);
});
test("hold needs uninterrupted samples until exactly 1800 ms", () => {
  for (const interrupt of [
    "release",
    "pointercancel",
    "lostcapture",
    "tab",
    "stalled frame",
    "success",
  ]) {
    const h = createHold(),
      s = running();
    h.begin(0);
    assert.equal(h.begin(50), false);
    for (let t = 100; t <= 1700; t += 100) assert.equal(h.sample(t, true), "holding");
    assert.equal(h.sample(1799, true), "holding");
    if (interrupt === "success") {
      assert.equal(h.sample(1800, true), "confirmed");
      const done = act(s, { type: "quit" }, start + 1800);
      assert.equal(
        transition(done, s.timerRevision, { type: "quit" }, start + 1801).history.length,
        1,
      );
    } else {
      if (interrupt === "tab") h.sample(1800, false);
      else if (interrupt === "stalled frame") h.sample(2100, true);
      else h.cancel();
      assert.equal(h.sample(2200, true), "cancelled");
      assert.equal(s.timer.phase, "running");
      assert.deepEqual(s.history, []);
    }
  }
  assert.ok(holdKey(" ") && holdKey("Enter") && !holdKey("r"));
});
test("roast boundaries prioritize 2 and 10 minutes before 80 percent", () => {
  const cases = [
    [119999, "Instant surrender"],
    [120000, "Early escape"],
    [120001, "Early escape"],
    [599999, "Early escape"],
    [600000, "Mid-session quit"],
    [600001, "Mid-session quit"],
    [1199999, "Mid-session quit"],
    [1200000, "Almost made it"],
    [1200001, "Almost made it"],
  ];
  for (const [ms, category] of cases) assert.equal(roast(ms, 1500000, "id").category, category);
  assert.equal(roast(110000, 120000, "id").category, "Instant surrender");
  assert.equal(roast(590000, 600000, "id").category, "Early escape");
  assert.ok(new Set(["a", "b", "c"].map((id) => roast(0, 60000, id).line)).size > 1);
});
test("Monday–Sunday calendar handles New Year, both DST transitions and local midnight", () => {
  assert.deepEqual(weekDays("2025-01-01"), [
    "2024-12-30",
    "2024-12-31",
    "2025-01-01",
    "2025-01-02",
    "2025-01-03",
    "2025-01-04",
    "2025-01-05",
  ]);
  assert.equal(monday("2025-03-09"), "2025-03-03");
  assert.equal(monday("2025-11-02"), "2025-10-27");
  assert.equal(dayKey(new Date("2025-01-06T04:59:59Z")), "2025-01-05");
  assert.equal(dayKey(new Date("2025-01-06T05:00:00Z")), "2025-01-06");
  assert.equal(clockTime(Date.parse("2025-03-09T07:01:00Z")), "03:01");
  assert.equal(clockTime(Date.parse("2025-11-02T06:01:00Z")), "01:01");
});
function record(day, mode, outcome, activeMs, id = mode + day + outcome, localTime = "14:32") {
  return {
    day,
    mode,
    outcome,
    activeMs,
    id,
    localTime,
    endedAt: new Date(day + "T" + localTime).getTime(),
    startedAt: null,
    plannedMs: 1_500_000,
  };
}
test("contribution and totals use terminal-day Focus records and the one legacy summary", () => {
  const s = {
    ...fresh(),
    legacy: { date: "2025-01-07", focusedMinutes: 25, completedSessions: 1 },
    history: [
      record("2025-01-06", "focus", "completed", 1_500_000),
      record("2025-01-12", "focus", "quit", 91_001),
      record("2025-01-12", "short", "completed", 300_000),
      record("2025-01-12", "long", "quit", 40_000),
      record("2025-01-08", "focus", "discarded", 199_000),
      record("2025-01-05", "focus", "completed", 1_500_000),
    ],
  };
  assert.deepEqual(summary(s, "2025-01-06", "2025-01-12"), {
    activeMs: 3_091_001,
    finished: 2,
    quits: 1,
  });
  assert.equal(summary(s).activeMs, 4_591_001);
  assert.equal(summary(s, "2025-01-12", "2025-01-12").finished, 0);
  assert.equal(summary(s, "2025-01-07", "2025-01-07").finished, 1);
  assert.equal(formatTime(3_091_001), "51m");
});
test("daily repeat quits reset at local midnight; breaks do not participate", () => {
  const log = [
    record("2025-01-06", "focus", "quit", 60_000, "q1", "00:01"),
    record("2025-01-06", "focus", "quit", 60_000, "q2"),
    record("2025-01-06", "long", "quit", 1),
    record("2025-01-07", "focus", "quit", 20_000, "q3", "00:00"),
  ];
  assert.deepEqual(
    dailyQuits(log, "2025-01-06").map((q) => q.label),
    ["Quit at 00:01.", "Quit at 14:32. Again."],
  );
  assert.deepEqual(
    dailyQuits(log, "2025-01-07").map((q) => q.label),
    ["Quit at 00:00."],
  );
});
test("first visit after a new week claims one actual previous-week verdict", () => {
  const s = fresh();
  assert.equal(claimVerdict(s, "2025-01-06"), s);
  const next = claimVerdict(s, "2025-01-16");
  assert.equal(next.verdictWeek, "2025-01-13");
  const reload = decode(JSON.parse(JSON.stringify(next)), start);
  assert.equal(claimVerdict(reload, "2025-01-19"), reload);
  assert.match(verdict(s, "2025-01-16").text, /Not enough/);
  assert.match(
    verdict(
      {
        ...s,
        legacy: {
          date: "2025-01-12",
          completedSessions: 2,
          focusedMinutes: 50,
        },
      },
      "2025-01-16",
    ).text,
    /50m of focus, 2 finished sessions and 0 deliberate quits/,
  );
});
test("V2 migration preserves actual fields, never fabricates starts and runs once", async () => {
  const legacy = {
    date: "2025-01-06",
    completedSessions: 2,
    focusedMinutes: 45,
  };
  const storage = memory({
    "pomo.profile.v1": { name: "M" },
    "pomo.settings.v1": { durations: { focus: 30 }, sound: false },
    "pomo.daily-stats.v1": legacy,
    "pomo.tasks.v1": [{ id: "t", title: "Task", done: false }],
    "pomo.active-task.v1": "t",
    "pomo.timer.v1": { mode: "focus", isRunning: false, secondsLeft: 400 },
  });
  const a = createStore(() => storage, direct);
  await a.visit();
  const saved = a.getSnapshot().data;
  assert.equal(saved.settings.durations.focus, 30);
  assert.equal(saved.settings.sound, false);
  assert.equal(saved.activeTaskId, "t");
  assert.equal(saved.profile.name, "M");
  assert.equal(saved.timer.phase, "paused");
  assert.equal(saved.timer.startedAt, null);
  assert.equal(saved.timer.remainingMs, 400_000);
  assert.deepEqual(saved.history, []);
  assert.deepEqual(saved.legacy, legacy);
  assert.equal(storage.getItem("pomo.daily-stats.v1"), JSON.stringify(legacy));
  const b = createStore(() => storage, direct);
  await b.visit();
  assert.deepEqual(b.getSnapshot().data, saved);
  assert.equal(summary(saved).finished, 2);
});
test("V2 completed display produces no synthetic completion; expired V2 deadline recovers once", () => {
  const old = (isRunning) =>
    memory({
      "pomo.timer.v1": {
        mode: "short",
        isRunning,
        deadline: start,
        secondsLeft: 0,
      },
    });
  assert.deepEqual(migrate(old(false), start, "one").history, []);
  const expired = migrate(old(true), start + 1000, "one");
  const done = act(expired, { type: "expire" }, start + 1000);
  assert.equal(done.history[0].mode, "short");
  assert.equal(done.history[0].endedAt, start);
  assert.equal(done.history[0].startedAt, null);
});
test("saved snapshot is atomic; a stale tab cannot change an active session or repeat side effects", async () => {
  const storage = memory({ [STORAGE_KEY]: fresh() });
  const first = createStore(() => storage, direct),
    second = createStore(() => storage, direct);
  await first.timer(0, { type: "start", id: "one" }, start);
  assert.equal(
    await second.edit(0, () => {
      throw Error("unreachable");
    }),
    false,
  );
  assert.equal(
    await first.edit(1, () => {
      throw Error("unreachable");
    }),
    false,
  );
  const end = start + 1_500_000;
  const results = await Promise.all([
    first.timer(1, { type: "expire" }, end),
    second.timer(1, { type: "expire" }, end),
  ]);
  assert.equal(results.filter((r) => r.record).length, 1);
  const saved = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(saved.timer.phase, "completed");
  assert.equal(saved.history.length, 1);
});
test("invalid input, unsupported snapshots and blocked/quota storage are safe", async () => {
  const bad = decode(
    {
      history: [null, {}],
      legacy: { date: "2025-02-30" },
      tasks: [null],
      settings: null,
      timer: { phase: "paused", remainingMs: -2 },
    },
    start,
  );
  assert.deepEqual(bad.history, []);
  assert.deepEqual(bad.tasks, []);
  assert.equal(bad.timer.phase, "idle");
  assert.equal(bad.legacy, null);
  for (const raw of ["{", '{"version":4}']) {
    const storage = memory();
    storage.setItem(STORAGE_KEY, raw);
    const store = createStore(() => storage, direct);
    await store.visit();
    assert.equal(storage.getItem(STORAGE_KEY), raw);
    assert.ok(store.getSnapshot().warning);
  }
  for (const access of [
    () => {
      throw Error("blocked");
    },
    () => ({
      getItem: () => null,
      setItem: () => {
        throw Error("quota");
      },
    }),
  ]) {
    const store = createStore(access, direct);
    await store.timer(0, { type: "start", id: "volatile" }, start);
    assert.equal(store.getSnapshot().data.timer.phase, "running");
    assert.ok(store.getSnapshot().warning);
  }
});

test("retry saves in-memory work when space returns and protects concurrent changes", async () => {
  for (const otherTab of [false, true]) {
    const disk = memory({ [STORAGE_KEY]: fresh() });
    let full = true;
    const storage = {
      getItem: disk.getItem,
      setItem(k, v) {
        if (full) throw Error("quota");
        disk.setItem(k, v);
      },
    };
    const store = createStore(() => storage, direct);
    await store.timer(0, { type: "start", id: "working" }, start);
    assert.ok(store.getSnapshot().warning);
    full = false;
    if (otherTab)
      disk.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...fresh(), profile: { name: "Changed elsewhere" } }),
      );
    await store.retry();
    const saved = JSON.parse(disk.getItem(STORAGE_KEY));
    if (otherTab) {
      assert.equal(saved.profile.name, "Changed elsewhere");
      assert.equal(store.getSnapshot().data.timer.id, "working");
      assert.ok(store.getSnapshot().warning);
    } else {
      assert.equal(store.getSnapshot().warning, "");
      assert.equal(saved.timer.id, "working");
    }
  }
});

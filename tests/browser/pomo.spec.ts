import { test, expect, type Page } from "@playwright/test";
import type { State } from "../../src/model";

async function snapshot(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("pomo.state.v3")!) as State);
}
async function open(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("First, what should we call you?").fill("Muzaib");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Start focus" })).toBeVisible();
}
const hold = (p: Page) => p.getByRole("button", { name: "Hold to quit for 1.8 seconds" });
async function start(p: Page) {
  await p.getByRole("button", { name: "Start focus" }).click();
  await expect(hold(p)).toBeVisible();
}
async function pressPointer(page: Page) {
  await hold(page).scrollIntoViewIfNeeded();
  const rect = (await hold(page).boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await expect(hold(page)).toHaveAttribute("aria-pressed", "true");
}

test.beforeEach(async ({ context }) => {
  await context.route("https://fonts.googleapis.com/**", (route) => route.abort());
});

test("onboarding, locked controls, shortcuts, task edits, paused settings and Analytics at 320px", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("New task title").fill("Write one page");
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByRole("button", { name: "Edit Write one page" }).click();
  await page.getByRole("textbox", { name: "Edit task title" }).fill("Finish draft");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await start(page);
  const running = (await snapshot(page)).timer;
  expect(running.phase).toBe("running");
  for (const control of [
    page.getByRole("tab", { name: /Go offline/ }),
    page.getByLabel("Reset timer"),
    page.getByLabel("Skip session"),
    page.getByLabel("Open settings"),
    page.getByLabel("Complete Finish draft"),
    page.getByLabel("New task title"),
    page.getByLabel("Delete Finish draft"),
  ]) {
    if (await control.count()) await expect(control).toBeDisabled();
  }
  await page.keyboard.press("r");
  await page.keyboard.press("n");
  await page.keyboard.press("Escape");
  expect((await snapshot(page)).timer).toEqual(running);
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Resume session" })).toBeVisible();
  const paused = (await snapshot(page)).timer;
  await page.getByLabel("Open settings").click();
  await page.getByLabel("Focus duration in minutes").fill("40");
  await page.getByRole("switch", { name: "Gentle completion sound" }).click();
  await page.keyboard.press("Escape");
  await page.reload();
  expect((await snapshot(page)).timer).toEqual(paused);
  expect((await snapshot(page)).settings.durations.focus).toBe(40);
  await page.getByRole("button", { name: "Resume session" }).click();
  await expect(hold(page)).toBeVisible();
  await page.getByLabel("Open analytics").click();
  const dialog = page.getByRole("dialog", { name: "Analytics" });
  const days = dialog.getByRole("group", { name: "Choose a day" }).getByRole("button");
  await expect(days).toHaveCount(7);
  await days.nth(6).click();
  await expect(days.nth(6)).toHaveAttribute("aria-pressed", "true");
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = (await days.nth(6).boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await dialog.getByRole("button", { name: "Back to timer" }).click();
  await expect(hold(page)).toBeVisible();
});

test("pointer cancellation paths, outside release, and deliberate pointer/keyboard quits", async ({
  page,
}) => {
  await open(page);
  await start(page);
  const original = (await snapshot(page)).timer;
  await hold(page).click();
  await hold(page).dblclick();
  for (const interrupt of [
    "move",
    "pointercancel",
    "lostpointercapture",
    "blur",
    "visibilitychange",
  ]) {
    await pressPointer(page);
    if (interrupt === "move") await page.mouse.move(1, 1);
    else if (interrupt === "blur")
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else if (interrupt === "visibilitychange") {
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        Reflect.deleteProperty(document, "hidden");
      });
    } else await hold(page).dispatchEvent(interrupt);
    await page.mouse.up();
    await expect(hold(page)).toHaveAttribute("aria-pressed", "false");
    expect((await snapshot(page)).timer).toEqual(original);
  }
  await hold(page).focus();
  await page.keyboard.down("Space");
  await expect(hold(page)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("Space");
  expect((await snapshot(page)).timer.phase).toBe("running");
  await pressPointer(page);
  await expect(page.getByText("Focus session quit", { exact: true })).toBeVisible();
  await page.mouse.up();
  await start(page);
  await hold(page).focus();
  await page.keyboard.down("Enter");
  await expect(page.getByText("Focus session quit", { exact: true })).toBeVisible();
  await page.keyboard.up("Enter");
  expect((await snapshot(page)).history.map((r) => r.outcome)).toEqual(["quit", "quit"]);
  await page.getByLabel("Open analytics").click();
  await expect(page.getByText(/Quit at \d\d:\d\d\. Again\./)).toBeVisible();
  await expect(page.locator(".contributed")).toHaveCount(0);
});

test("two tabs recovering the same expired V2 session record one finish and one verdict", async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    localStorage.setItem("pomo.profile.v1", JSON.stringify({ name: "M" }));
    localStorage.setItem("pomo.settings.v1", JSON.stringify({ sound: false }));
    const date = new Date();
    date.setDate(date.getDate() - 7);
    const key = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    localStorage.setItem(
      "pomo.daily-stats.v1",
      JSON.stringify({ date: key, focusedMinutes: 50, completedSessions: 2 }),
    );
    localStorage.setItem(
      "pomo.timer.v1",
      JSON.stringify({
        mode: "focus",
        secondsLeft: 1,
        isRunning: true,
        deadline: Date.now() - 2000,
      }),
    );
  });
  const other = await context.newPage();
  await Promise.all([page.goto("/"), other.goto("/")]);
  await expect.poll(async () => (await snapshot(page))?.history.length).toBe(1);
  const winner = page.getByRole("dialog", { name: "Last week’s verdict" });
  const second = other.getByRole("dialog", { name: "Last week’s verdict" });
  await expect.poll(async () => (await winner.count()) + (await second.count())).toBe(1);
  await ((await winner.count()) ? winner : second).getByRole("button").click();
  await Promise.all([page.reload(), other.reload()]);
  await expect(winner).toHaveCount(0);
  await expect(second).toHaveCount(0);
  await page.getByLabel("Open analytics").click();
  await expect(page.getByText(/50m of focus, 2 finished sessions/)).toBeVisible();
  await expect(page.locator(".contributed")).toHaveCount(1);
  expect((await snapshot(other)).history).toHaveLength(1);
});

test("touch can quit a break without a Focus accountability entry", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 640 },
  });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4183/");
    await page.getByPlaceholder("Your name").fill("M");
    await page.getByLabel("Continue").tap();
    await page.getByRole("tab", { name: /Quick reset/ }).tap();
    await page.getByRole("button", { name: "Start break" }).tap();
    await hold(page).scrollIntoViewIfNeeded();
    const rect = (await hold(page).boundingBox())!;
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }],
    });
    await expect(page.getByText("Break ended", { exact: true })).toBeVisible();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.getByLabel("Open analytics").tap();
    await expect(page.getByText("No deliberate Focus quits today.")).toBeVisible();
    expect((await snapshot(page)).history.map((r) => [r.mode, r.outcome])).toEqual([
      ["short", "quit"],
    ]);
  } finally {
    await context.close();
  }
});

test("quit log rolls over at local midnight and still contributes to lifetime", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2025-03-10T03:59:40Z") }); // Sunday, 23:59:40 in New York.
  await open(page);
  await start(page);
  await hold(page).focus();
  await page.keyboard.down("Space");
  await page.clock.runFor(1900);
  await expect(page.getByText("Focus session quit", { exact: true })).toBeVisible();
  await page.keyboard.up("Space");
  await page.getByLabel("Open analytics").click();
  await expect(page.getByText("Quit at 23:59.")).toBeVisible();
  await page.clock.fastForward(25_000);
  const verdict = page.getByRole("dialog", {
    name: "Last week’s verdict",
    exact: true,
  });
  await verdict.getByRole("button").click();
  await expect(page.getByText("No deliberate Focus quits today.")).toBeVisible();
  await expect(page.getByText(/Lifetime recorded focus time/)).toContainText("<1m");
  await expect(page.getByText(/0 finished sessions and 1 deliberate quit/)).toBeVisible();
});

test("live completion sends each enabled signal once across visibility events and reload", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const count = (key: string) =>
      sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key)) + 1));
    Object.defineProperty(window, "Notification", {
      value: class {
        static permission = "granted";
        constructor() {
          count("notifications");
        }
      },
    });
    const Audio = window.AudioContext;
    Object.defineProperty(window, "AudioContext", {
      value: class extends Audio {
        constructor() {
          super();
          count("chimes");
        }
      },
    });
    localStorage.setItem(
      "pomo.settings.v1",
      JSON.stringify({ sound: true, notifications: true, durations: { focus: 1 } }),
    );
  });
  await page.clock.install();
  await open(page);
  await start(page);
  await page.clock.fastForward(61_000);
  await expect(page.getByText("Focus session complete", { exact: true })).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.reload();
  await expect(page.getByRole("button", { name: "Start again" })).toBeVisible();
  expect((await snapshot(page)).history.map((r) => [r.outcome, r.activeMs])).toEqual([
    ["completed", 60_000],
  ]);
  expect(
    await page.evaluate(() => [
      sessionStorage.getItem("chimes"),
      sessionStorage.getItem("notifications"),
    ]),
  ).toEqual(["1", "1"]);
});

test("first installed PWA reopens offline and recovers the paused timer", async ({
  context,
  page,
}) => {
  await open(page);
  await start(page);
  await page.getByRole("button", { name: "Pause session" }).click();
  await expect(page.getByRole("button", { name: "Resume session" })).toBeVisible();
  const paused = (await snapshot(page)).timer;
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        }),
      );
  });
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Resume session" })).toBeVisible();
  expect((await snapshot(page)).timer).toEqual(paused);
});

test("compact running view enlarges the dial, keeps the selected task and restores the dashboard", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("New task title").fill("Review the prototype");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByRole("button", { name: /Today’s rhythm/ }).click();
  const primary = page.locator(".primary-control");
  const dial = page.locator(".timer-orb");
  const digits = page.locator(".timer-minutes");
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [768, 1024],
    [1024, 1366],
  ]) {
    await page.setViewportSize({ width, height });
    const ready = await dial.boundingBox();
    const readyDigits = await digits.boundingBox();
    await primary.focus();
    await page.keyboard.press("Space");
    await expect(primary).toHaveText(/Pause session/);
    await expect(primary).toBeFocused();
    await expect(page.locator(".mode-switch")).toBeHidden();
    await expect(page.locator(".tasks-column")).toBeHidden();
    await expect(page.locator(".stats-column")).toBeHidden();
    await expect(page.locator(".session-task")).toHaveText("Review the prototype");
    const running = (await dial.boundingBox())!;
    expect(running.width).toBeGreaterThan(ready!.width);
    expect(Math.abs(running.width - running.height)).toBeLessThan(1);
    expect((await digits.boundingBox())!.height).toBeGreaterThan(readyDigits!.height);
    const pause = (await primary.boundingBox())!;
    expect(pause.y + pause.height).toBeLessThanOrEqual(height);
    await page.keyboard.press("Space");
    await expect(primary).toHaveText(/Resume session/);
    await expect(page.locator(".tasks-column")).toBeVisible();
    await expect(page.locator(".mode-switch")).toBeVisible();
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.getByRole("button", { name: /Today’s rhythm/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByRole("tab", { name: /Quick reset/ }).click();
  await primary.click();
  await expect(hold(page)).toBeVisible();
  await expect(page.locator(".session-task")).toBeHidden();
  await expect(page.locator(".mode-switch")).toBeHidden();
});

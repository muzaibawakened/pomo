# pomo. — Make room for focus

A local-first Pomodoro timer built with React, TypeScript, Tailwind CSS and Vite. The dashboard includes onboarding, editable tasks, daily progress, timer preferences, optional sound and desktop notifications. The installable PWA caches its shell for offline use.

## Run and verify

Use Node 22.18+ or Node 24 and install the locked dependencies.

```sh
npm ci
npm run dev
```

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Playwright runs the production preview locally. Set `POMO_BROWSER_CHANNEL` to `chrome` or `msedge` to run against an installed desktop browser. The unit tests use Node’s built-in runner.

## Timer and controls

- Focus, Short Break and Long Break default to 25, 5 and 15 minutes. Skip from Focus suggests a long break after every fourth finish that day. Sessions start manually.
- Space starts, pauses or resumes. Buttons retain native keyboard activation. Editors and dialogs own their keyboard input. R resets and N skips while ready, completed or paused.
- A running timer locks mode, reset, skip, task, profile and preference changes. Pause retains the session ID, original plan and exact milliseconds remaining. Duration changes apply to the next fresh session.
- To deliberately quit, hold the left timer button continuously for 1.8 seconds. With keyboard focus on that button, hold Space or Enter. Release early, move the pointer outside, lose focus or switch tabs to cancel. The countdown also cancels when it cannot verify frame continuity.
- The timer uses a wall-clock deadline so suspension and reopening count toward the active segment. A forward clock jump can finish it early. A backward jump can delay it, with remaining time capped at the amount available at the start of the current segment.

## Storage and recovery

`pomo.state.v3` holds the profile, preferences, tasks, selected task, current timer, timer revision, terminal session records, an optional V2 daily aggregate and the last claimed verdict week. A terminal transition appends one ID-keyed record and closes the timer in a single localStorage write. Reopening after expiry credits the deadline. Stale actions carry an earlier timer revision and are ignored.

On secure origins, Web Locks serialize actions across supported browser tabs. Each transaction reads the latest snapshot before checking the revision. Older environments without Web Locks should use a single tab. If saving fails, the current tab keeps working in memory. Retry save writes those changes if the stored baseline is still safe to replace.

Migration reads the original V2 keys and leaves them intact. A saved V2 daily total remains one dated aggregate. A recovered V2 countdown receives an ID and keeps an unknown start timestamp. A stopped V2 timer showing its full duration is indistinguishable from ready. A stopped zero display is restored as completed without generating another event.

## Analytics

Analytics opens beside Settings. Totals use the **local end date** of each session. For a recovered completion this is the deadline, interpreted in the device’s time zone at reconciliation. Captured day and clock labels stay fixed if the user later travels. Weeks run Monday through Sunday.

| Outcome | Focus time | Finished | Focus quits |
| --- | --- | --- | --- |
| Completed Focus | Full planned duration | 1 | 0 |
| Hold-to-quit Focus | Active elapsed duration | 0 | 1 |
| Paused and resumed | Accrues within the same session | 0 until completion | 0 |
| Reset, skip or mode change from pause | Excluded | 0 | 0 |
| Break session | Excluded | 0 | 0 |
| V2 daily summary | Explicit recorded minutes | Explicit finishes | No historical quit data |

Analytics sums milliseconds before formatting minutes. Each green day requires a recorded Focus finish. The daily quit log uses the stored local time and adds “Again.” from the second Focus quit onward. Historical entries remain available to weekly and lifetime calculations.

Roast selection uses active elapsed time including the confirmed hold. Below 2 minutes is instant surrender, then below 10 minutes is early escape. At 10 minutes and above, less than 80% is mid-session and the rest is almost-made-it. The session ID chooses a stable line. Break quits receive neutral feedback.

A first-time user starts with the current week as their baseline. On the first visit in a later week, the app claims that week’s verdict before displaying it. A valid older V2 date can establish the earlier baseline. The previous Monday–Sunday summary remains available in Analytics after dismissal or refresh. An empty week shows an insufficient-data message.

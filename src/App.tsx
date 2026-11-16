import { LocalClock } from "./LocalClock";
import { TimerFace } from "./TimerFace";
import { remaining } from "./timer";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AnalyticsView } from "./AnalyticsView";
import { Dialog } from "./Dialog";
import { HoldToQuit } from "./HoldToQuit";
import { roast, summary, verdict } from "./analytics.ts";
import { makeId, type Mode, type SessionRecord, type State, type Task } from "./model.ts";
import { store } from "./store.ts";
import { usePomo } from "./usePomo";

type Notice = { kind: "focus" | "break" | "info"; title: string; body: string };

const MODES: Record<
  Mode,
  {
    label: string;
    shortLabel: string;
    eyebrow: string;
  }
> = {
  focus: { label: "Focus", shortLabel: "Lock in", eyebrow: "Deep focus" },
  short: {
    label: "Short break",
    shortLabel: "Quick reset",
    eyebrow: "Quick reset",
  },
  long: {
    label: "Long break",
    shortLabel: "Go offline",
    eyebrow: "Offline break",
  },
};
function Icon({
  name,
  className = "h-5 w-5",
}: {
  name:
    | "play"
    | "pause"
    | "reset"
    | "skip"
    | "check"
    | "plus"
    | "settings"
    | "close"
    | "pencil"
    | "trash"
    | "arrow"
    | "spark"
    | "bell"
    | "volume"
    | "analytics";
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<typeof name, ReactNode> = {
    analytics: (
      <>
        <path d="M4 4v16h16" />
        <path d="M8 16v-4m5 4V7m5 9v-7" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />,
    pause: (
      <>
        <path d="M9 5v14" />
        <path d="M15 5v14" />
      </>
    ),
    reset: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
      </>
    ),
    skip: (
      <>
        <path d="m5 5 10 7L5 19V5Z" />
        <path d="M19 5v14" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    settings: (
      <>
        <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
        <path
          d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 1 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 1 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 1 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z"
          transform="translate(1 1) scale(.83)"
        />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12" />
        <path d="M18 6 6 18" />
      </>
    ),
    pencil: (
      <>
        <path d="m4 20 4.2-1 10.6-10.6a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" />
        <path d="m14.8 6.2 3 3" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M10 11v6M14 11v6" />
        <path d="m6 7 1 13h10l1-13" />
        <path d="M9 7V4h6v3" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
        <path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    volume: (
      <>
        <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
        <path d="M17 9a5 5 0 0 1 0 6" />
        <path d="M19 5a9 9 0 0 1 0 14" />
      </>
    ),
  };
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" {...common}>
      {paths[name]}
    </svg>
  );
}

function playCompletionSound() {
  try {
    const context = new window.AudioContext();
    const now = context.currentTime;
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.16 + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + index * 0.16);
      oscillator.stop(now + index * 0.16 + 0.24);
    });
    window.setTimeout(() => void context.close(), 800);
  } catch {
    // Audio may be unavailable or blocked by the browser; the timer still completes normally.
  }
}

function App() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const onRecord = useCallback((record: SessionRecord) => {
    if (record.outcome === "quit") {
      const focus = record.mode === "focus";
      setNotice({
        kind: "info",
        title: focus ? "Focus session quit" : "Break ended",
        body: focus
          ? roast(record.activeMs, record.plannedMs, record.id).line
          : "Ready for your next session.",
      });
      return;
    }
    if (record.outcome !== "completed") return;
    const focus = record.mode === "focus";
    const title = focus ? "Focus session complete" : "Break complete";
    const body = focus
      ? "You showed up for yourself. Take a breath before the next thing."
      : "Gently bring your attention back when you're ready.";
    setNotice({ kind: focus ? "focus" : "break", title, body });
    const { settings } = store.getSnapshot().data;
    if (settings.sound) playCompletionSound();
    if (
      settings.notifications &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification(title, { body, tag: record.id });
      } catch {
        /* OS notifications are optional. */
      }
    }
  }, []);
  const { data, warning, today, send, verdictOpen: verdictDue, dismissVerdict } = usePomo(onRecord);
  const { settings, tasks, activeTaskId, timer, timerRevision } = data;
  // Keep Pause and Quit reachable if a recovered running timer has a damaged profile.
  const profile = data.profile ?? (timer.phase === "running" ? { name: "friend" } : null);
  const [onboardingName, setOnboardingName] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile?.name ?? "");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState("");
  const onboardingInputRef = useRef<HTMLInputElement>(null);
  const isRunning = timer.phase === "running";
  const verdictOpen = verdictDue && !isRunning;
  const mode = timer.mode;
  const totalSeconds =
    timer.phase === "running" || timer.phase === "paused"
      ? timer.plannedMs / 1000
      : settings.durations[mode] * 60;
  const stats = useMemo(
    () => summary({ history: data.history, legacy: data.legacy }, today, today),
    [data.history, data.legacy, today],
  );
  const activeTask = useMemo(
    () =>
      tasks.find((task) => task.id === activeTaskId && !task.done) ??
      tasks.find((task) => !task.done) ??
      null,
    [activeTaskId, tasks],
  );
  const nextTask = useMemo(
    () => tasks.find((task) => !task.done && task.id !== activeTask?.id) ?? null,
    [activeTask?.id, tasks],
  );
  const cycleProgress = stats.finished === 0 ? 0 : ((stats.finished - 1) % 4) + 1;
  const edit = (update: (state: State) => State) => store.edit(timerRevision, update);
  const unlocked = () => {
    const current = store.getSnapshot().data;
    return current.timer.phase !== "running" && current.timerRevision === timerRevision;
  };
  const closeSettings = () => {
    setIsSettingsOpen(false);
    setIsEditingName(false);
  };
  const cancelTaskEdit = () => {
    setEditingTaskId(null);
    setTaskDraft("");
  };
  useEffect(() => {
    if (isRunning) {
      closeSettings();
      cancelTaskEdit();
    }
  }, [isRunning]);
  useEffect(() => {
    if (!profile) onboardingInputRef.current?.focus();
  }, [profile]);
  const changeMode = (mode: Mode) => {
    if (unlocked()) {
      setNotice(null);
      void send({ type: "mode", mode });
    }
  };
  const resetTimer = () => {
    if (unlocked()) {
      setNotice(null);
      void send({ type: "reset" });
    }
  };
  const skipSession = () => {
    if (unlocked()) {
      setNotice(null);
      void send({ type: "skip" });
    }
  };
  const toggleTimer = () => {
    if (isSettingsOpen || isEditingName || analyticsOpen || verdictOpen) return;
    if (isRunning) {
      void send({ type: "pause" });
      return;
    }
    if (editingTaskId) finishTaskEdit();
    setNotice(null);
    void send(timer.phase === "paused" ? { type: "resume" } : { type: "start", id: makeId() });
  };
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      if (e.key === "Escape" && editingTaskId) {
        cancelTaskEdit();
        return;
      }
      if (
        !profile ||
        e.repeat ||
        e.isComposing ||
        e.defaultPrevented ||
        e.metaKey ||
        e.altKey ||
        e.ctrlKey ||
        isSettingsOpen ||
        isEditingName ||
        analyticsOpen ||
        verdictOpen ||
        editingTaskId
      )
        return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.isContentEditable || target?.closest("input,textarea,select,dialog")) return;
      if (e.code === "Space") {
        if (target?.closest("button,a[href]")) return;
        e.preventDefault();
        toggleTimer();
      } else if (e.key.toLowerCase() === "r") resetTimer();
      else if (e.key.toLowerCase() === "n") skipSession();
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });
  function saveProfile(value: string) {
    const name = value.trim().replace(/\s+/g, " ").slice(0, 28);
    if (name) void edit((s) => ({ ...s, profile: { name } }));
  }
  function submitOnboarding(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    saveProfile(onboardingName);
  }
  function saveName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    saveProfile(nameDraft);
    setIsEditingName(false);
  }
  function addTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = newTaskTitle.trim().slice(0, 120);
    if (!title || !unlocked()) return;
    const task = { id: makeId(), title, done: false };
    void edit((s) => ({
      ...s,
      tasks: [...s.tasks, task],
      activeTaskId: task.id,
    }));
    setNewTaskTitle("");
  }
  function startTaskEdit(task: Task) {
    if (unlocked()) {
      setEditingTaskId(task.id);
      setTaskDraft(task.title);
    }
  }
  function finishTaskEdit() {
    const title = taskDraft.trim().slice(0, 120);
    if (title)
      void edit((s) => ({
        ...s,
        tasks: s.tasks.map((t) => (t.id === editingTaskId ? { ...t, title } : t)),
      }));
    cancelTaskEdit();
  }
  function setActiveTaskId(id: string) {
    void edit((s) =>
      s.tasks.some((t) => t.id === id && !t.done) ? { ...s, activeTaskId: id } : s,
    );
  }
  function toggleTaskDone(id: string) {
    void edit((s) => {
      const task = s.tasks.find((t) => t.id === id);
      if (!task) return s;
      const tasks = s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
      const activeTaskId = task.done
        ? id
        : s.activeTaskId === id
          ? (tasks.find((t) => !t.done)?.id ?? null)
          : s.activeTaskId;
      return { ...s, tasks, activeTaskId };
    });
  }
  function deleteTask(id: string) {
    void edit((s) => {
      const tasks = s.tasks.filter((t) => t.id !== id);
      return {
        ...s,
        tasks,
        activeTaskId:
          s.activeTaskId === id ? (tasks.find((t) => !t.done)?.id ?? null) : s.activeTaskId,
      };
    });
    if (editingTaskId === id) cancelTaskEdit();
  }
  function updateDuration(target: Mode, value: number) {
    const minutes = Math.min(180, Math.max(1, Math.round(value || 1)));
    void edit((s) => ({
      ...s,
      settings: {
        ...s.settings,
        durations: { ...s.settings.durations, [target]: minutes },
      },
    }));
  }
  async function toggleNotifications() {
    if (!unlocked()) return;
    if (settings.notifications) {
      await edit((s) => ({
        ...s,
        settings: { ...s.settings, notifications: false },
      }));
      return;
    }
    if (!("Notification" in window)) {
      setNotice({
        kind: "info",
        title: "Notifications unavailable",
        body: "This browser does not support desktop notifications.",
      });
      return;
    }
    try {
      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      if (!unlocked()) return;
      if (permission === "granted")
        await edit((s) => ({
          ...s,
          settings: { ...s.settings, notifications: true },
        }));
      setNotice(
        permission === "granted"
          ? {
              kind: "info",
              title: "Notifications enabled",
              body: "We'll let you know when a session ends.",
            }
          : {
              kind: "info",
              title: "Notifications are blocked",
              body: "Allow notifications for this site in your browser settings.",
            },
      );
    } catch {
      setNotice({
        kind: "info",
        title: "Notifications unavailable",
        body: "Check your browser’s notification settings.",
      });
    }
  }

  const storageMessage = warning && (
    <div role="alert" className="storage-warning">
      {warning} <button onClick={() => void store.retry()}>Retry save</button>
    </div>
  );
  if (!profile) {
    return (
      <main className="welcome-screen">
        {storageMessage}
        <div className="welcome-grain" aria-hidden="true" />
        <div className="welcome-orb welcome-orb-one" aria-hidden="true" />
        <div className="welcome-orb welcome-orb-two" aria-hidden="true" />
        <header className="welcome-topbar">
          <span className="wordmark">
            pomo<span>.</span>
          </span>
          <span className="welcome-index">A QUIETER WAY TO WORK</span>
        </header>
        <section className="welcome-content" aria-labelledby="welcome-title">
          <div className="welcome-mark">
            <span className="welcome-mark-dot" />
            <span className="welcome-mark-ring" />
          </div>
          <p className="welcome-kicker">
            <span /> YOUR TIME, YOUR SPACE
          </p>
          <h1 id="welcome-title">
            Make a little
            <br />
            <em>room for focus.</em>
          </h1>
          <p className="welcome-copy">
            A softer place to land your attention. One thoughtful session at a time.
          </p>
          <form className="welcome-form" onSubmit={submitOnboarding}>
            <label htmlFor="welcome-name">First, what should we call you?</label>
            <div className="welcome-input-wrap">
              <input
                ref={onboardingInputRef}
                id="welcome-name"
                autoComplete="given-name"
                maxLength={28}
                value={onboardingName}
                onChange={(event) => setOnboardingName(event.target.value)}
                placeholder="Your name"
                required
              />
              <button type="submit" aria-label="Continue" disabled={!onboardingName.trim()}>
                <Icon name="arrow" className="h-5 w-5" />
              </button>
            </div>
            <p className="welcome-privacy">
              <span className="privacy-lock">⌑</span> Just for a personal touch. Your name stays on
              this device.
            </p>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell ${mode}-canvas ${isRunning ? "focus-mode" : ""}`}>
      <div className="studio-light" aria-hidden="true">
        <div />
      </div>
      <div className="paper-grid" aria-hidden="true" />

      {storageMessage}
      <header className="app-header">
        <a href="#home" className="wordmark app-wordmark" aria-label="pomo home">
          pomo<span>.</span>
        </a>
        <LocalClock />
        <div className="header-actions">
          <button
            className="profile-pill"
            disabled={isRunning}
            onClick={() => {
              if (!unlocked()) return;
              setNameDraft(profile.name);
              setIsEditingName(true);
            }}
            title={isRunning ? "Pause to edit your name" : "Edit your name"}
          >
            <span className="profile-presence" />
            <span className="profile-label">Focusing as</span>
            <strong>{profile.name}</strong>
            <Icon name="pencil" className="profile-pencil h-3.5 w-3.5" />
          </button>
          <button
            className="icon-button"
            onClick={() => setAnalyticsOpen(true)}
            aria-label="Open analytics"
            title="Analytics"
          >
            <Icon name="analytics" />
          </button>
          <button
            className="icon-button settings-trigger"
            disabled={isRunning}
            onClick={() => {
              if (unlocked()) {
                setNameDraft(profile.name);
                setIsSettingsOpen(true);
              }
            }}
            aria-label="Open settings"
            title={isRunning ? "Pause to open settings" : "Settings"}
          >
            <Icon name="settings" className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <section className="dashboard-grid" id="home">
        <aside className="stats-column" data-expanded={statsExpanded}>
          <button
            className="rhythm-toggle"
            aria-expanded={statsExpanded}
            aria-controls="daily-rhythm"
            onClick={() => setStatsExpanded(!statsExpanded)}
          >
            Today’s rhythm{" "}
            <span>
              {stats.finished} finished <b aria-hidden="true">{statsExpanded ? "−" : "+"}</b>
            </span>
          </button>
          <div id="daily-rhythm">
            <div className="section-eyebrow">
              <span className="eyebrow-line" /> YOUR RHYTHM
            </div>
            <section className="stats-card glass-card">
              <div className="stats-card-top">
                <div>
                  <p className="stats-number">
                    {stats.finished}
                    <span>{stats.finished === 1 ? " session" : " sessions"}</span>
                  </p>
                  <p className="muted-label">completed today</p>
                </div>
                <span className={`status-chip ${stats.finished > 0 ? "status-chip-active" : ""}`}>
                  <span className="chip-dot" />
                  {stats.finished > 0 ? "IN MOTION" : "FRESH START"}
                </span>
              </div>
              <div
                className="session-pips"
                aria-label={`${cycleProgress} of 4 sessions in the current cycle`}
              >
                {[0, 1, 2, 3].map((item) => (
                  <span
                    key={item}
                    className={`session-pip ${item < cycleProgress ? "session-pip-done" : ""}`}
                  >
                    {item < cycleProgress ? (
                      <Icon name="check" className="h-4 w-4" />
                    ) : (
                      <span className="pip-number">0{item + 1}</span>
                    )}
                  </span>
                ))}
              </div>
              <div className="stats-card-foot">
                <span>Focus cycle</span>
                <span>{cycleProgress}/4</span>
              </div>
            </section>
            <div className="focus-minutes-note">
              <span className="minutes-icon">
                <Icon name="spark" className="h-4 w-4" />
              </span>
              <p>
                <strong>{Math.floor(stats.activeMs / 60_000)} min</strong> of intentional focus
                today.
              </p>
            </div>
          </div>
        </aside>

        <section className="timer-column" aria-label="Pomodoro timer">
          <div className="mode-switch" data-mode={mode} role="tablist" aria-label="Timer mode">
            {(Object.keys(MODES) as Mode[]).map((item) => (
              <button
                key={item}
                role="tab"
                aria-selected={mode === item}
                aria-disabled={isRunning}
                disabled={isRunning}
                onClick={() => changeMode(item)}
                className={`mode-option ${mode === item ? "mode-option-active" : ""}`}
              >
                <span className="mode-option-top">
                  <span className={`mode-dot mode-dot-${item}`} />
                  {settings.durations[item]} MIN
                </span>
                <span className="mode-option-label">{MODES[item].shortLabel}</span>
              </button>
            ))}
          </div>

          <TimerFace
            timer={timer}
            totalSeconds={totalSeconds}
            send={send}
            label={MODES[mode].label}
          />
          {activeTask && mode === "focus" && (
            <p className="session-task" title={activeTask.title}>
              {activeTask.title}
            </p>
          )}
          <div className="timer-controls">
            {isRunning ? (
              <HoldToQuit
                key={timerRevision}
                getPrompt={() => {
                  const progress = 1 - remaining(timer, Date.now()) / timer.plannedMs;
                  return mode !== "focus"
                    ? "Ready to leave this break?"
                    : progress >= 0.8
                      ? "You’re in the last stretch. Give the finish line a chance."
                      : progress < 0.1
                        ? "Give yourself a minute to settle in."
                        : "The relief lasts a moment. Give it one more breath.";
                }}
                onQuit={() => void send({ type: "quit" })}
              />
            ) : (
              <button
                className="round-control"
                onClick={resetTimer}
                aria-label="Reset timer"
                title="Reset (R)"
              >
                <Icon name="reset" className="h-[18px] w-[18px]" />
              </button>
            )}
            <button className="primary-control" onClick={toggleTimer}>
              <Icon name={isRunning ? "pause" : "play"} className="h-4 w-4" />
              <span>
                {isRunning
                  ? "Pause session"
                  : timer.phase === "paused"
                    ? "Resume session"
                    : timer.phase === "completed"
                      ? "Start again"
                      : mode === "focus"
                        ? "Start focus"
                        : "Start break"}
              </span>
              <kbd>{isRunning ? "SPACE" : "↵"}</kbd>
            </button>
            <button
              className="round-control"
              onClick={skipSession}
              disabled={isRunning}
              aria-label="Skip session"
              title={isRunning ? "Pause before switching sessions" : "Skip (N)"}
            >
              <Icon name="skip" className="h-[18px] w-[18px]" />
            </button>
          </div>
          <div className="keyboard-hint">
            <span className="keyboard-key">SPACE</span> {isRunning ? "to pause" : "to begin"}
            <span className="hint-divider" />
            {isRunning ? (
              "Hold Quit for 1.8s"
            ) : (
              <>
                <span className="keyboard-key">R</span> to reset
              </>
            )}
          </div>

          {notice && (
            <div className={`completion-note completion-${notice.kind}`} role="status">
              <span className="completion-icon">
                <Icon name={notice.kind === "focus" ? "check" : "spark"} className="h-4 w-4" />
              </span>
              <div className="completion-copy">
                <strong>{notice.title}</strong>
                <span>{notice.body}</span>
              </div>
              <button
                className="completion-dismiss"
                onClick={() => setNotice(null)}
                aria-label="Dismiss message"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
          )}
          {timer.phase === "completed" && (
            <button className="next-session-button" onClick={skipSession}>
              {mode === "focus" ? "Take a break" : "Back to focus"}
              <Icon name="arrow" className="h-4 w-4" />
            </button>
          )}
        </section>

        <aside className="tasks-column">
          <div className="section-eyebrow">
            <span className="eyebrow-line" /> THE ONE THING
          </div>
          <section className="task-focus-card">
            <div className="task-card-header">
              <span className="task-card-label">NOW FOCUSING ON</span>
              <span className="task-spark">
                <Icon name="spark" className="h-4 w-4" />
              </span>
            </div>
            {activeTask ? (
              <>
                {editingTaskId === activeTask.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      finishTaskEdit();
                    }}
                    className="active-task-edit-form"
                  >
                    <input
                      autoFocus
                      maxLength={120}
                      value={taskDraft}
                      disabled={isRunning}
                      onChange={(event) => setTaskDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelTaskEdit();
                        }
                      }}
                      aria-label="Edit task title"
                    />
                    <div className="task-edit-actions">
                      <button type="submit" disabled={isRunning || !taskDraft.trim()}>
                        Save
                      </button>
                      <button type="button" disabled={isRunning} onClick={cancelTaskEdit}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    className="active-task-title"
                    disabled={isRunning}
                    onClick={() => startTaskEdit(activeTask)}
                    title={isRunning ? "Pause to edit this task" : "Click to edit this task"}
                  >
                    {activeTask.title}
                    <Icon name="pencil" className="h-4 w-4" />
                  </button>
                )}
              </>
            ) : (
              <div className="empty-focus">
                <span className="empty-focus-icon">
                  <Icon name="spark" className="h-5 w-5" />
                </span>
                <strong>Choose a focus task</strong>
                <p>Add your first task below.</p>
              </div>
            )}
          </section>

          <section className="task-list-card glass-card">
            <div className="task-list-heading">
              <div>
                <p className="task-list-title">Your list</p>
              </div>
              <span className="task-total-badge">{tasks.length}</span>
            </div>
            {tasks.length > 0 ? (
              <div className="task-list">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`task-row ${task.done ? "task-row-done" : ""} ${
                      activeTask?.id === task.id ? "task-row-current" : ""
                    }`}
                  >
                    <button
                      className={`task-check ${task.done ? "task-check-done" : ""}`}
                      disabled={isRunning}
                      onClick={() => toggleTaskDone(task.id)}
                      aria-label={
                        task.done ? `Mark ${task.title} incomplete` : `Complete ${task.title}`
                      }
                    >
                      <Icon name="check" className="h-3.5 w-3.5" />
                    </button>
                    {editingTaskId === task.id && activeTask?.id !== task.id ? (
                      <form
                        className="task-edit-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          finishTaskEdit();
                        }}
                      >
                        <input
                          autoFocus
                          maxLength={120}
                          value={taskDraft}
                          disabled={isRunning}
                          onChange={(event) => setTaskDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelTaskEdit();
                            }
                          }}
                          aria-label="Edit task"
                        />
                        <div className="task-edit-actions">
                          <button type="submit" disabled={isRunning || !taskDraft.trim()}>
                            Save
                          </button>
                          <button type="button" disabled={isRunning} onClick={cancelTaskEdit}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        className="task-row-title"
                        disabled={isRunning}
                        onClick={() => {
                          if (isRunning) return;
                          if (!task.done) setActiveTaskId(task.id);
                          else startTaskEdit(task);
                        }}
                        title={
                          task.done ? "Click to edit completed task" : "Make this your current task"
                        }
                      >
                        {task.title}
                      </button>
                    )}
                    <div className="task-row-actions">
                      <button
                        disabled={isRunning}
                        onClick={() => startTaskEdit(task)}
                        aria-label={`Edit ${task.title}`}
                        title="Edit"
                      >
                        <Icon name="pencil" className="h-3.5 w-3.5" />
                      </button>
                      <button
                        disabled={isRunning}
                        onClick={() => deleteTask(task.id)}
                        aria-label={`Delete ${task.title}`}
                        title="Delete"
                      >
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="task-list-empty">
                <span className="task-empty-line" />
                <p>Your list starts with one small thing.</p>
              </div>
            )}
            <form className="add-task-form" onSubmit={addTask}>
              <input
                value={newTaskTitle}
                disabled={isRunning}
                onChange={(event) => setNewTaskTitle(event.target.value)}
                maxLength={120}
                placeholder="Add a task for this session…"
                aria-label="New task title"
              />
              <button
                type="submit"
                aria-label="Add task"
                disabled={isRunning || !newTaskTitle.trim()}
              >
                <Icon name="plus" className="h-4 w-4" />
              </button>
            </form>
            {nextTask && (
              <button
                className="next-task-link"
                disabled={isRunning}
                onClick={() => {
                  if (!isRunning) setActiveTaskId(nextTask.id);
                }}
              >
                <span>UP NEXT</span>
                <strong>{nextTask.title}</strong>
                <Icon name="arrow" className="h-4 w-4" />
              </button>
            )}
          </section>
        </aside>
      </section>

      {analyticsOpen && (
        <AnalyticsView data={data} today={today} onClose={() => setAnalyticsOpen(false)} />
      )}
      {verdictOpen && (
        <Dialog titleId="verdict-title" onClose={dismissVerdict}>
          <h2 id="verdict-title">Last week’s verdict</h2>
          <p>{verdict(data, today).text}</p>
          <button className="small-save-button" onClick={dismissVerdict} autoFocus>
            Back to focus
          </button>
        </Dialog>
      )}
      {!isRunning && (isSettingsOpen || isEditingName) && (
        <Dialog titleId="settings-title" onClose={closeSettings}>
          <div className="settings-modal-header">
            <div>
              <span className="settings-kicker">YOUR SPACE</span>
              <h2 id="settings-title">
                {isEditingName && !isSettingsOpen ? "Edit your name" : "Settings"}
              </h2>
            </div>
            <button
              className="icon-button modal-close"
              onClick={() => {
                setIsSettingsOpen(false);
                setIsEditingName(false);
              }}
              aria-label="Close settings"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>
          {isSettingsOpen && !isEditingName && (
            <button className="edit-profile-setting" onClick={() => setIsEditingName(true)}>
              Edit profile name <strong>{profile.name}</strong>
            </button>
          )}
          {isEditingName && (
            <form className="name-settings-row" onSubmit={saveName}>
              <div>
                <strong>Your name</strong>
                <span>We'll use it to make this space feel personal.</span>
              </div>
              <input
                autoFocus
                value={nameDraft}
                maxLength={28}
                onChange={(event) => setNameDraft(event.target.value)}
                aria-label="Your name"
              />
              <button className="small-save-button" type="submit">
                Save
              </button>
            </form>
          )}
          {isSettingsOpen && (
            <>
              <div className="settings-section">
                <div className="settings-section-title">
                  <strong>Session length</strong>
                  <span>1–180 minutes</span>
                </div>
                <div className="duration-settings">
                  {(["focus", "short", "long"] as Mode[]).map((item) => (
                    <label key={item} className="duration-field">
                      <span>{MODES[item].label}</span>
                      <div>
                        <input
                          type="number"
                          min={1}
                          max={180}
                          disabled={isRunning}
                          value={settings.durations[item]}
                          onChange={(event) => updateDuration(item, Number(event.target.value))}
                          aria-label={`${MODES[item].label} duration in minutes`}
                        />
                        <span>min</span>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="settings-footnote">
                  New lengths apply to the next session. Reset a paused timer to use its new length.
                </p>
              </div>
              <div className="settings-section settings-toggles">
                <div className="setting-toggle-row">
                  <span className="setting-icon">
                    <Icon name="volume" className="h-4 w-4" />
                  </span>
                  <div>
                    <strong>Gentle completion sound</strong>
                    <span>A soft tone when a session ends.</span>
                  </div>
                  <button
                    className={`toggle-switch ${settings.sound ? "toggle-on" : ""}`}
                    disabled={isRunning}
                    role="switch"
                    aria-label="Gentle completion sound"
                    aria-checked={settings.sound}
                    onClick={() => {
                      void edit((s) => ({
                        ...s,
                        settings: { ...s.settings, sound: !s.settings.sound },
                      }));
                    }}
                  >
                    <span />
                  </button>
                </div>
                <div className="setting-toggle-row">
                  <span className="setting-icon">
                    <Icon name="bell" className="h-4 w-4" />
                  </span>
                  <div>
                    <strong>Desktop notifications</strong>
                    <span>Get a nudge when a timer finishes.</span>
                  </div>
                  <button
                    className={`toggle-switch ${settings.notifications ? "toggle-on" : ""}`}
                    disabled={isRunning}
                    role="switch"
                    aria-label="Desktop notifications"
                    aria-checked={settings.notifications}
                    onClick={toggleNotifications}
                  >
                    <span />
                  </button>
                </div>
              </div>
              <div className="settings-modal-bottom">
                <span>
                  <span className="privacy-dot" /> Preferences and tasks stay on this device.
                </span>
                <button onClick={() => setIsSettingsOpen(false)}>
                  Done <Icon name="arrow" className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </main>
  );
}

export default App;

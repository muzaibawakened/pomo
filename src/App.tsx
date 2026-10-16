import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

type Mode = "focus" | "short" | "long";
type Task = { id: string; title: string; done: boolean };
type Profile = { name: string };
type Durations = Record<Mode, number>;
type Settings = { durations: Durations; sound: boolean; notifications: boolean };
type DailyStats = { date: string; completedSessions: number; focusedMinutes: number };
type Notice = { kind: "focus" | "break" | "info"; title: string; body: string };

const MODES: Record<Mode, { label: string; shortLabel: string; eyebrow: string }> = {
  focus: { label: "Focus", shortLabel: "Lock in", eyebrow: "Deep focus" },
  short: { label: "Short break", shortLabel: "Quick reset", eyebrow: "Quick reset" },
  long: { label: "Long break", shortLabel: "Go offline", eyebrow: "Offline break" },
};
const STORAGE = {
  profile: "pomo.profile.v1",
  settings: "pomo.settings.v1",
  tasks: "pomo.tasks.v1",
  activeTask: "pomo.active-task.v1",
  stats: "pomo.daily-stats.v1",
  timer: "pomo.timer.v1",
};
const DEFAULT_SETTINGS: Settings = {
  durations: { focus: 25, short: 5, long: 15 },
  sound: true,
  notifications: false,
};

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function readSettings(): Settings {
  const saved = readStored<Partial<Settings>>(STORAGE.settings, {});
  const durations: Partial<Durations> = saved.durations ?? {};
  const validDuration = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(180, Math.max(1, Math.round(value))) : fallback;
  return {
    durations: {
      focus: validDuration(durations.focus, DEFAULT_SETTINGS.durations.focus),
      short: validDuration(durations.short, DEFAULT_SETTINGS.durations.short),
      long: validDuration(durations.long, DEFAULT_SETTINGS.durations.long),
    },
    sound: typeof saved.sound === "boolean" ? saved.sound : DEFAULT_SETTINGS.sound,
    notifications: typeof saved.notifications === "boolean" ? saved.notifications : DEFAULT_SETTINGS.notifications,
  };
}

function readDailyStats(): DailyStats {
  const stored = readStored<Partial<DailyStats>>(STORAGE.stats, {});
  if (stored.date !== todayKey()) {
    return { date: todayKey(), completedSessions: 0, focusedMinutes: 0 };
  }
  return {
    date: todayKey(),
    completedSessions: Math.max(0, Number(stored.completedSessions) || 0),
    focusedMinutes: Math.max(0, Number(stored.focusedMinutes) || 0),
  };
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: "play" | "pause" | "reset" | "skip" | "check" | "plus" | "settings" | "close" | "pencil" | "trash" | "arrow" | "spark" | "bell" | "volume";
  className?: string;
}) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<typeof name, ReactNode> = {
    play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />,
    pause: <><path d="M9 5v14" /><path d="M15 5v14" /></>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
    skip: <><path d="m5 5 10 7L5 19V5Z" /><path d="M19 5v14" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    settings: <><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 1 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 1 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 1 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" transform="translate(1 1) scale(.83)" /></>,
    close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
    pencil: <><path d="m4 20 4.2-1 10.6-10.6a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" /><path d="m14.8 6.2 3 3" /></>,
    trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="m6 7 1 13h10l1-13" /><path d="M9 7V4h6v3" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    volume: <><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="M17 9a5 5 0 0 1 0 6" /><path d="M19 5a9 9 0 0 1 0 14" /></>,
  };
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" {...common}>{paths[name]}</svg>;
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
  const [profile, setProfile] = useState<Profile | null>(() => {
    const saved = readStored<Profile | null>(STORAGE.profile, null);
    return saved && typeof saved.name === "string" && saved.name.trim() ? saved : null;
  });
  const [onboardingName, setOnboardingName] = useState("");
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [savedTimer] = useState(() => readStored<{ mode?: Mode; secondsLeft?: number; deadline?: number | null; isRunning?: boolean } | null>(STORAGE.timer, null));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile?.name ?? "");
  const initialMode: Mode = savedTimer?.mode === "short" || savedTimer?.mode === "long" || savedTimer?.mode === "focus" ? savedTimer.mode : "focus";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (savedTimer?.isRunning && typeof savedTimer.deadline === "number") return Math.max(0, Math.ceil((savedTimer.deadline - Date.now()) / 1000));
    return typeof savedTimer?.secondsLeft === "number" && savedTimer.secondsLeft >= 0 ? Math.floor(savedTimer.secondsLeft) : settings.durations[initialMode] * 60;
  });
  const [isRunning, setIsRunning] = useState(() => Boolean(savedTimer?.isRunning && typeof savedTimer.deadline === "number"));
  const [deadline, setDeadline] = useState<number | null>(() => typeof savedTimer?.deadline === "number" ? savedTimer.deadline : null);
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = readStored<Task[]>(STORAGE.tasks, []);
    return Array.isArray(saved) ? saved.filter((task) => task && typeof task.id === "string" && typeof task.title === "string") : [];
  });
  const [activeTaskId, setActiveTaskId] = useState<string | null>(() => readStored<string | null>(STORAGE.activeTask, null));
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState("");
  const [stats, setStats] = useState<DailyStats>(readDailyStats);
  const [notice, setNotice] = useState<Notice | null>(null);
  const finishedRef = useRef(false);
  const onboardingInputRef = useRef<HTMLInputElement>(null);

  const totalSeconds = settings.durations[mode] * 60;
  const progress = Math.min(1, Math.max(0, 1 - secondsLeft / totalSeconds));
  const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const seconds = (secondsLeft % 60).toString().padStart(2, "0");
  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId && !task.done) ?? tasks.find((task) => !task.done) ?? null,
    [activeTaskId, tasks],
  );
  const nextTask = useMemo(
    () => tasks.find((task) => !task.done && task.id !== activeTask?.id) ?? null,
    [activeTask?.id, tasks],
  );
  const cycleProgress = stats.completedSessions === 0 ? 0 : ((stats.completedSessions - 1) % 4) + 1;
  const sessionStatus = secondsLeft === 0 ? "Session complete" : !isRunning ? "Ready when you are" : MODES[mode].eyebrow;
  const message = secondsLeft === 0
    ? mode === "focus" ? `Beautiful work, ${profile?.name ?? "friend"}. Let your mind breathe.` : `Rest well spent, ${profile?.name ?? "friend"}. Ready for one more?`
    : mode !== "focus" ? `Rest is part of the work, ${profile?.name ?? "friend"}. No guilt.`
      : isRunning && progress > 0.65 ? `Nearly there, ${profile?.name ?? "friend"}. Stay with it.`
        : isRunning ? `You're in it now, ${profile?.name ?? "friend"}. One thing at a time.`
          : activeTask ? `Ready when you are, ${profile?.name ?? "friend"}. Give this your attention.` : `A little focus goes a long way, ${profile?.name ?? "friend"}.`;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE.profile, JSON.stringify(profile));
    } catch { /* Storage may be unavailable in private browsing. */ }
  }, [profile]);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
      window.localStorage.setItem(STORAGE.tasks, JSON.stringify(tasks));
      window.localStorage.setItem(STORAGE.activeTask, JSON.stringify(activeTaskId));
      window.localStorage.setItem(STORAGE.stats, JSON.stringify(stats));
      window.localStorage.setItem(STORAGE.timer, JSON.stringify({ mode, secondsLeft, deadline, isRunning }));
    } catch { /* Keep the app usable even when persistence is blocked. */ }
  }, [activeTaskId, deadline, isRunning, mode, secondsLeft, settings, stats, tasks]);
  useEffect(() => {
    if (!profile) {
      window.setTimeout(() => onboardingInputRef.current?.focus(), 160);
    }
  }, [profile]);

  const announceCompletion = useCallback((completedMode: Mode, completedName: string) => {
    const nextNotice: Notice = completedMode === "focus"
      ? { kind: "focus", title: "Focus session complete", body: "You showed up for yourself. Take a breath before the next thing." }
      : { kind: "break", title: "Break complete", body: "Gently bring your attention back when you're ready." };
    setNotice(nextNotice);
    if (settings.sound) playCompletionSound();
    if (settings.notifications && "Notification" in window && Notification.permission === "granted") {
      try { new Notification(nextNotice.title, { body: nextNotice.body, tag: "pomo-session" }); } catch { /* Notifications may be blocked by the operating system. */ }
    }
    if (completedMode === "focus") {
      setStats((current) => ({
        ...current,
        date: todayKey(),
        completedSessions: current.date === todayKey() ? current.completedSessions + 1 : 1,
        focusedMinutes: (current.date === todayKey() ? current.focusedMinutes : 0) + settings.durations.focus,
      }));
    }
    document.title = `Session complete · pomo.`;
    void completedName;
  }, [settings.durations.focus, settings.notifications, settings.sound]);

  useEffect(() => {
    if (!isRunning || deadline === null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && !finishedRef.current) {
        finishedRef.current = true;
        setIsRunning(false);
        setDeadline(null);
        announceCompletion(mode, profile?.name ?? "friend");
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [announceCompletion, deadline, isRunning, mode, profile?.name]);

  useEffect(() => {
    document.title = secondsLeft === 0
      ? `${mode === "focus" ? "Focus complete" : "Break complete"} · pomo.`
      : `${minutes}:${seconds} · pomo.`;
  }, [minutes, mode, seconds, secondsLeft]);

  useEffect(() => {
    if (!profile) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
        setIsEditingName(false);
        return;
      }
      if (isSettingsOpen || isEditingName) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.code === "Space") {
        event.preventDefault();
        toggleTimer();
      } else if (event.key.toLowerCase() === "r") {
        resetTimer();
      } else if (event.key.toLowerCase() === "n") {
        skipSession();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // The handlers are intentionally refreshed whenever the timer state changes.
  });

  const changeMode = (nextMode: Mode) => {
    finishedRef.current = false;
    setMode(nextMode);
    setSecondsLeft(settings.durations[nextMode] * 60);
    setIsRunning(false);
    setDeadline(null);
    setNotice(null);
  };

  const resetTimer = () => {
    finishedRef.current = false;
    setIsRunning(false);
    setDeadline(null);
    setSecondsLeft(settings.durations[mode] * 60);
    setNotice(null);
  };

  const toggleTimer = () => {
    if (isRunning) {
      const remaining = deadline === null ? secondsLeft : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      setIsRunning(false);
      setDeadline(null);
      return;
    }
    const remaining = secondsLeft <= 0 ? settings.durations[mode] * 60 : secondsLeft;
    finishedRef.current = false;
    setSecondsLeft(remaining);
    setDeadline(Date.now() + remaining * 1000);
    setIsRunning(true);
    setNotice(null);
  };

  const skipSession = () => {
    if (mode === "focus") {
      const longBreakDue = stats.completedSessions > 0 && stats.completedSessions % 4 === 0;
      changeMode(longBreakDue ? "long" : "short");
    } else {
      changeMode("focus");
    }
  };

  const submitOnboarding = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = onboardingName.trim().replace(/\s+/g, " ").slice(0, 28);
    if (!cleanName) return;
    setProfile({ name: cleanName });
    setNameDraft(cleanName);
  };

  const saveName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = nameDraft.trim().replace(/\s+/g, " ").slice(0, 28);
    if (cleanName) setProfile({ name: cleanName });
    setIsEditingName(false);
  };

  const addTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) return;
    const task = { id: makeId(), title: title.slice(0, 120), done: false };
    setTasks((current) => [...current, task]);
    setActiveTaskId(task.id);
    setNewTaskTitle("");
  };

  const startTaskEdit = (task: Task) => {
    setEditingTaskId(task.id);
    setTaskDraft(task.title);
  };

  const finishTaskEdit = () => {
    if (editingTaskId) {
      const clean = taskDraft.trim();
      if (clean) setTasks((current) => current.map((task) => task.id === editingTaskId ? { ...task, title: clean.slice(0, 120) } : task));
    }
    setEditingTaskId(null);
  };

  const toggleTaskDone = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    setTasks((current) => current.map((item) => item.id === taskId ? { ...item, done: !item.done } : item));
    if (!task.done && activeTaskId === taskId) {
      setActiveTaskId(tasks.find((item) => item.id !== taskId && !item.done)?.id ?? null);
    } else if (task.done) {
      setActiveTaskId(taskId);
    }
  };

  const deleteTask = (taskId: string) => {
    const next = tasks.find((task) => task.id !== taskId && !task.done);
    setTasks((current) => current.filter((task) => task.id !== taskId));
    if (activeTaskId === taskId) setActiveTaskId(next?.id ?? null);
    if (editingTaskId === taskId) setEditingTaskId(null);
  };

  const updateDuration = (target: Mode, value: number) => {
    const safeValue = Math.min(180, Math.max(1, Math.round(value || 1)));
    setSettings((current) => ({ ...current, durations: { ...current.durations, [target]: safeValue } }));
    if (mode === target && !isRunning) setSecondsLeft(safeValue * 60);
  };

  const toggleNotifications = async () => {
    if (settings.notifications) {
      setSettings((current) => ({ ...current, notifications: false }));
      return;
    }
    if (!("Notification" in window)) {
      setNotice({ kind: "info", title: "Notifications aren't available", body: "Your browser doesn't support desktop notifications." });
      return;
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission === "granted") {
      setSettings((current) => ({ ...current, notifications: true }));
      setNotice({ kind: "info", title: "Notifications enabled", body: "We'll let you know when a session ends." });
    } else {
      setNotice({ kind: "info", title: "Notifications are blocked", body: "Allow notifications for this site in your browser settings, then try again." });
    }
  };

  if (!profile) {
    return (
      <main className="welcome-screen">
        <div className="welcome-grain" aria-hidden="true" />
        <div className="welcome-orb welcome-orb-one" aria-hidden="true" />
        <div className="welcome-orb welcome-orb-two" aria-hidden="true" />
        <header className="welcome-topbar">
          <span className="wordmark">pomo<span>.</span></span>
          <span className="welcome-index">A QUIETER WAY TO WORK</span>
        </header>
        <section className="welcome-content" aria-labelledby="welcome-title">
          <div className="welcome-mark"><span className="welcome-mark-dot" /><span className="welcome-mark-ring" /></div>
          <p className="welcome-kicker"><span /> YOUR TIME, YOUR SPACE</p>
          <h1 id="welcome-title">Make a little<br /><em>room for focus.</em></h1>
          <p className="welcome-copy">A softer place to land your attention. One thoughtful session at a time.</p>
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
              <button type="submit" aria-label="Continue" disabled={!onboardingName.trim()}><Icon name="arrow" className="h-5 w-5" /></button>
            </div>
            <p className="welcome-privacy"><span className="privacy-lock">⌑</span> Just for a personal touch. Your name stays on this device.</p>
          </form>
        </section>
        <footer className="welcome-footer"><span>TAKE YOUR TIME.</span><span>YOU'RE RIGHT ON TIME.</span></footer>
      </main>
    );
  }

  const atmosphere = mode === "focus"
    ? { canvas: "focus-canvas", halo: "focus-halo", accent: "focus-accent" }
    : mode === "short"
      ? { canvas: "short-canvas", halo: "short-halo", accent: "short-accent" }
      : { canvas: "long-canvas", halo: "long-halo", accent: "long-accent" };

  return (
    <main className={`app-shell ${atmosphere.canvas}`}>
      <div className="paper-grid" aria-hidden="true" />
      <div className="noise" aria-hidden="true" />
      <div className={`ambient-blob ambient-main ${atmosphere.halo}`} aria-hidden="true" />
      <div className={`ambient-blob ambient-side ${atmosphere.accent}`} aria-hidden="true" />
      <div className="ambient-ring ring-one" aria-hidden="true" />
      <div className="ambient-ring ring-two" aria-hidden="true" />

      <header className="app-header">
        <a href="#home" className="wordmark app-wordmark" aria-label="pomo home">pomo<span>.</span></a>
        <div className="header-actions">
          <button className="profile-pill" onClick={() => { setNameDraft(profile.name); setIsEditingName(true); }} title="Edit your name">
            <span className="profile-presence" />
            <span className="profile-label">Focusing as</span>
            <strong>{profile.name}</strong>
            <Icon name="pencil" className="profile-pencil h-3.5 w-3.5" />
          </button>
          <button className="icon-button settings-trigger" onClick={() => setIsSettingsOpen(true)} aria-label="Open settings" title="Settings">
            <Icon name="settings" className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <section className="dashboard-grid" id="home">
        <aside className="stats-column">
          <div className="section-eyebrow"><span className="eyebrow-line" /> YOUR RHYTHM</div>
          <section className="stats-card glass-card">
            <div className="stats-card-top">
              <div>
                <p className="stats-number">{stats.completedSessions}<span> sessions</span></p>
                <p className="muted-label">completed today</p>
              </div>
              <span className={`status-chip ${stats.completedSessions > 0 ? "status-chip-active" : ""}`}>
                <span className="chip-dot" />{stats.completedSessions > 0 ? "IN MOTION" : "FRESH START"}
              </span>
            </div>
            <div className="session-pips" aria-label={`${cycleProgress} of 4 sessions in the current cycle`}>
              {[0, 1, 2, 3].map((item) => (
                <span key={item} className={`session-pip ${item < cycleProgress ? "session-pip-done" : ""}`}>
                  {item < cycleProgress ? <Icon name="check" className="h-4 w-4" /> : <span className="pip-number">0{item + 1}</span>}
                </span>
              ))}
            </div>
            <div className="stats-card-foot"><span>Focus cycle</span><span>{cycleProgress}/4</span></div>
          </section>
          <div className="focus-minutes-note">
            <span className="minutes-icon"><Icon name="spark" className="h-4 w-4" /></span>
            <p><strong>{stats.focusedMinutes} min</strong> of intentional focus today.<br /><span>Small things, done with care.</span></p>
          </div>
          <div className="daily-note">
            <span className="daily-note-mark">“</span>
            <p>The goal isn't to do everything.<br />It's to be here for one thing.</p>
          </div>
        </aside>

        <section className="timer-column" aria-label="Pomodoro timer">
          <div className="mode-switch" role="tablist" aria-label="Timer mode">
            {(Object.keys(MODES) as Mode[]).map((item) => (
              <button
                key={item}
                role="tab"
                aria-selected={mode === item}
                onClick={() => changeMode(item)}
                className={`mode-option ${mode === item ? "mode-option-active" : ""}`}
              >
                <span className="mode-option-top"><span className={`mode-dot mode-dot-${item}`} />{settings.durations[item]} MIN</span>
                <span className="mode-option-label">{MODES[item].shortLabel}</span>
              </button>
            ))}
          </div>

          <div className={`timer-orb timer-orb-${mode} ${isRunning ? "timer-orb-running" : ""}`}>
            <div className="orb-hairline" aria-hidden="true" />
            <svg className="timer-ring" viewBox="0 0 300 300" aria-hidden="true">
              <circle className="timer-ring-track" cx="150" cy="150" r="135" fill="none" strokeWidth="3.5" />
              <circle
                className="timer-ring-progress"
                cx="150" cy="150" r="135" fill="none" strokeWidth="3.5" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 135}
                strokeDashoffset={2 * Math.PI * 135 * (1 - progress)}
              />
            </svg>
            <div className="timer-content">
              <div className="session-state">
                <span className={`state-glyph state-glyph-${mode} ${isRunning ? "state-glyph-live" : ""}`}><span /></span>
                <span className="state-copy"><span className="state-overline">SESSION STATE</span><strong>{sessionStatus}</strong></span>
              </div>
              <div className="timer-digits" aria-live="off" aria-label={`${minutes} minutes and ${seconds} seconds remaining`}>
                <span className="timer-minutes">{minutes}</span>
                <span className="timer-seconds-wrap"><span className="timer-seconds">{seconds}</span><span className="seconds-label">SEC</span></span>
              </div>
              <div className="timer-message"><span className="message-rule" />{message}</div>
            </div>
          </div>

          <div className="timer-controls">
            <button className="round-control" onClick={resetTimer} aria-label="Reset timer" title="Reset (R)"><Icon name="reset" className="h-[18px] w-[18px]" /></button>
            <button className="primary-control" onClick={toggleTimer}>
              <Icon name={isRunning ? "pause" : "play"} className="h-4 w-4" />
              <span>{isRunning ? "Pause session" : secondsLeft === 0 ? "Start again" : mode === "focus" ? "Start focus" : "Start break"}</span>
              <kbd>{isRunning ? "SPACE" : "↵"}</kbd>
            </button>
            <button className="round-control" onClick={skipSession} aria-label="Skip session" title="Skip (N)"><Icon name="skip" className="h-[18px] w-[18px]" /></button>
          </div>
          <div className="keyboard-hint"><span className="keyboard-key">SPACE</span> {isRunning ? "to pause" : "to begin"}<span className="hint-divider" /><span className="keyboard-key">R</span> to reset</div>

          {notice && (
            <div className={`completion-note completion-${notice.kind}`} role="status">
              <span className="completion-icon"><Icon name={notice.kind === "focus" ? "check" : "spark"} className="h-4 w-4" /></span>
              <div className="completion-copy"><strong>{notice.title}</strong><span>{notice.body}</span></div>
              <button className="completion-dismiss" onClick={() => setNotice(null)} aria-label="Dismiss message"><Icon name="close" className="h-4 w-4" /></button>
            </div>
          )}
          {secondsLeft === 0 && (
            <button className="next-session-button" onClick={() => changeMode(mode === "focus" ? (stats.completedSessions > 0 && stats.completedSessions % 4 === 0 ? "long" : "short") : "focus")}>
              {mode === "focus" ? "Take a break" : "Back to focus"}<Icon name="arrow" className="h-4 w-4" />
            </button>
          )}
        </section>

        <aside className="tasks-column">
          <div className="section-eyebrow"><span className="eyebrow-line" /> THE ONE THING</div>
          <section className="task-focus-card">
            <div className="task-card-header"><span className="task-card-label">NOW FOCUSING ON</span><span className="task-spark"><Icon name="spark" className="h-4 w-4" /></span></div>
            {activeTask ? (
              <>
                {editingTaskId === activeTask.id ? (
                  <form onSubmit={(event) => { event.preventDefault(); finishTaskEdit(); }} className="active-task-edit-form">
                    <input autoFocus maxLength={120} value={taskDraft} onChange={(event) => setTaskDraft(event.target.value)} onBlur={finishTaskEdit} aria-label="Edit task title" />
                  </form>
                ) : (
                  <button className="active-task-title" onClick={() => startTaskEdit(activeTask)} title="Click to edit this task">{activeTask.title}<Icon name="pencil" className="h-4 w-4" /></button>
                )}
                <p className="active-task-subtitle">One task. One tab. One step at a time.</p>
              </>
            ) : (
              <div className="empty-focus">
                <span className="empty-focus-icon"><Icon name="spark" className="h-5 w-5" /></span>
                <strong>Make space for one thing.</strong>
                <p>Add a task below and give it your full attention.</p>
              </div>
            )}
            <div className="task-card-footer"><span><span className="task-count-dot" />{tasks.filter((task) => !task.done).length} open {tasks.filter((task) => !task.done).length === 1 ? "task" : "tasks"}</span><span className="task-footer-note">{activeTask ? "IN YOUR CORNER" : "READY WHEN YOU ARE"}</span></div>
          </section>

          <section className="task-list-card glass-card">
            <div className="task-list-heading"><div><p className="task-list-title">Your list</p><p className="task-list-caption">Keep it light. Keep it moving.</p></div><span className="task-total-badge">{tasks.length}</span></div>
            {tasks.length > 0 ? (
              <div className="task-list">
                {tasks.map((task) => (
                  <div key={task.id} className={`task-row ${task.done ? "task-row-done" : ""} ${activeTask?.id === task.id ? "task-row-current" : ""}`}>
                    <button className={`task-check ${task.done ? "task-check-done" : ""}`} onClick={() => toggleTaskDone(task.id)} aria-label={task.done ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}><Icon name="check" className="h-3.5 w-3.5" /></button>
                    {editingTaskId === task.id ? (
                      <form className="task-edit-form" onSubmit={(event) => { event.preventDefault(); finishTaskEdit(); }}>
                        <input autoFocus maxLength={120} value={taskDraft} onChange={(event) => setTaskDraft(event.target.value)} onBlur={finishTaskEdit} aria-label="Edit task" />
                      </form>
                    ) : (
                      <button className="task-row-title" onClick={() => { if (!task.done) setActiveTaskId(task.id); else startTaskEdit(task); }} title={task.done ? "Click to edit completed task" : "Make this your current task"}>{task.title}</button>
                    )}
                    <div className="task-row-actions">
                      <button onClick={() => startTaskEdit(task)} aria-label={`Edit ${task.title}`} title="Edit"><Icon name="pencil" className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deleteTask(task.id)} aria-label={`Delete ${task.title}`} title="Delete"><Icon name="trash" className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="task-list-empty"><span className="task-empty-line" /><p>Your list starts with one small thing.</p></div>
            )}
            <form className="add-task-form" onSubmit={addTask}>
              <input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} maxLength={120} placeholder="Add a task for this session…" aria-label="New task title" />
              <button type="submit" aria-label="Add task" disabled={!newTaskTitle.trim()}><Icon name="plus" className="h-4 w-4" /></button>
            </form>
            {nextTask && <button className="next-task-link" onClick={() => setActiveTaskId(nextTask.id)}><span>UP NEXT</span><strong>{nextTask.title}</strong><Icon name="arrow" className="h-4 w-4" /></button>}
          </section>
        </aside>
      </section>

      <footer className="app-footer"><span><span className="footer-dot" /> MADE FOR THE NEXT 25 MINUTES</span><span>One thing at a time, {profile.name}.</span></footer>

      {(isSettingsOpen || isEditingName) && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setIsSettingsOpen(false); setIsEditingName(false); } }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-modal-header"><div><span className="settings-kicker">YOUR SPACE</span><h2 id="settings-title">{isEditingName && !isSettingsOpen ? "Let’s make it yours." : "A few preferences."}</h2><p>{isEditingName && !isSettingsOpen ? "A little personal touch, then back to your space." : "Make your focus ritual feel like yours."}</p></div><button className="icon-button modal-close" onClick={() => { setIsSettingsOpen(false); setIsEditingName(false); }} aria-label="Close settings"><Icon name="close" className="h-5 w-5" /></button></div>
            {isEditingName && (
              <form className="name-settings-row" onSubmit={saveName}>
                <div><strong>Your name</strong><span>We'll use it to make this space feel personal.</span></div>
                <input autoFocus value={nameDraft} maxLength={28} onChange={(event) => setNameDraft(event.target.value)} aria-label="Your name" />
                <button className="small-save-button" type="submit">Save</button>
              </form>
            )}
            {isSettingsOpen && <>
              <div className="settings-section"><div className="settings-section-title"><strong>Session length</strong><span>1–180 minutes</span></div>
                <div className="duration-settings">
                  {(["focus", "short", "long"] as Mode[]).map((item) => (
                    <label key={item} className="duration-field"><span>{MODES[item].label}</span><div><input type="number" min={1} max={180} disabled={isRunning && mode === item} value={settings.durations[item]} onChange={(event) => updateDuration(item, Number(event.target.value))} aria-label={`${MODES[item].label} duration in minutes`} /><span>min</span></div></label>
                  ))}
                </div>
                <p className="settings-footnote">The active timer stays untouched; adjust its length after pausing or resetting.</p>
              </div>
              <div className="settings-section settings-toggles">
                <div className="setting-toggle-row"><span className="setting-icon"><Icon name="volume" className="h-4 w-4" /></span><div><strong>Gentle completion sound</strong><span>A soft tone when a session ends.</span></div><button className={`toggle-switch ${settings.sound ? "toggle-on" : ""}`} role="switch" aria-checked={settings.sound} onClick={() => setSettings((current) => ({ ...current, sound: !current.sound }))}><span /></button></div>
                <div className="setting-toggle-row"><span className="setting-icon"><Icon name="bell" className="h-4 w-4" /></span><div><strong>Desktop notifications</strong><span>Get a nudge when a timer finishes.</span></div><button className={`toggle-switch ${settings.notifications ? "toggle-on" : ""}`} role="switch" aria-checked={settings.notifications} onClick={toggleNotifications}><span /></button></div>
              </div>
              <div className="settings-modal-bottom"><span><span className="privacy-dot" /> Preferences and tasks stay on this device.</span><button onClick={() => setIsSettingsOpen(false)}>Done <Icon name="arrow" className="h-4 w-4" /></button></div>
            </>}
          </section>
        </div>
      )}
    </main>
  );
}

export default App;

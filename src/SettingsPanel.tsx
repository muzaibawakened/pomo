import { useState, type FormEvent, type ReactNode } from "react";
import { Dialog } from "./Dialog";
import { modes, type Mode, type Settings } from "./model";
import { previewChime } from "./sound";
import "./settings.css";

const lengths = {
  focus: { label: "Focus", presets: [25, 45, 50] },
  short: { label: "Short break", presets: [5, 10] },
  long: { label: "Long break", presets: [15, 20, 30] },
};
export type DurationChange = number | ((current: number) => number);

function DurationRow({
  mode,
  value,
  onChange,
}: {
  mode: Mode;
  value: number;
  onChange: (change: DurationChange) => void;
}) {
  const { label, presets } = lengths[mode];
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  function discard() {
    setDraft(null);
    setError(false);
  }
  function commit() {
    const text = draft?.trim();
    if (!text) {
      discard();
      return;
    }
    const minutes = Number(text);
    if (!/^\d+$/.test(text) || minutes < 1 || minutes > 180) {
      setError(true);
      return;
    }
    if (minutes !== value) onChange(minutes);
    discard();
  }
  function change(next: DurationChange) {
    discard();
    onChange(next);
  }
  return (
    <div className="pref-duration" data-mode={mode}>
      <label htmlFor={`length-${mode}`} className="pref-mode">
        <i aria-hidden="true" />
        {label}
      </label>
      <div className="pref-stepper">
        <button
          type="button"
          aria-label={`Decrease ${label} by one minute`}
          disabled={value <= 1}
          onClick={() => change((n) => n - 1)}
        >
          −
        </button>
        <label className="pref-readout" htmlFor={`length-${mode}`}>
          <input
            id={`length-${mode}`}
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            aria-label={`${label} duration in minutes`}
            aria-invalid={error}
            aria-describedby={error ? `length-error-${mode}` : undefined}
            value={draft ?? String(value)}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(false);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape" && draft !== null) {
                e.preventDefault();
                e.stopPropagation();
                discard();
              }
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
          />
          <span aria-hidden="true">min</span>
        </label>
        <button
          type="button"
          aria-label={`Increase ${label} by one minute`}
          disabled={value >= 180}
          onClick={() => change((n) => n + 1)}
        >
          +
        </button>
      </div>
      <div className="pref-presets" role="group" aria-label={`${label} presets`}>
        {presets.map((n) => (
          <button
            type="button"
            key={n}
            aria-label={`Set ${label} to ${n} minutes`}
            aria-pressed={value === n}
            onClick={() => change(n)}
          >
            <span>{n}</span>
          </button>
        ))}
      </div>
      {error && (
        <p className="pref-error" id={`length-error-${mode}`} role="alert">
          Enter a whole number from 1 to 180.
        </p>
      )}
    </div>
  );
}

function Switch({
  label,
  checked,
  onClick,
  ownSound = false,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  ownSound?: boolean;
}) {
  return (
    <button
      className="pref-switch-row"
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      data-own-sound={ownSound || undefined}
    >
      {label}
      <span aria-hidden="true" className="pref-switch">
        <i />
      </span>
    </button>
  );
}

export function ProfileForm({
  value,
  saved,
  onChange,
  onSubmit,
  autoFocus,
}: {
  value: string;
  saved: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  autoFocus?: boolean;
}) {
  return (
    <form className="pref-profile" onSubmit={onSubmit}>
      <label htmlFor="profile-name">Your name</label>
      <div>
        <input
          id="profile-name"
          autoComplete="given-name"
          autoFocus={autoFocus}
          value={value}
          maxLength={28}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="submit" disabled={!value.trim() || value.trim() === saved}>
          Save
        </button>
      </div>
    </form>
  );
}

export function SettingsPanel({
  settings,
  paused,
  onDuration,
  onSound,
  onVolume,
  onNotifications,
  notificationMessage,
  onClose,
  children,
}: {
  settings: Settings;
  paused: boolean;
  onDuration: (mode: Mode, change: DurationChange) => void;
  onSound: (key: "sound" | "interactionSounds") => void;
  onVolume: (n: number) => void;
  onNotifications: () => void;
  notificationMessage: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog titleId="preferences-title" onClose={onClose}>
      <header className="pref-header">
        <h2 id="preferences-title">Settings</h2>
        <button type="button" className="pref-done" autoFocus onClick={onClose}>
          Done
        </button>
      </header>
      <div className="pref-scroll">
        <section aria-labelledby="lengths-title">
          <div className="pref-section-head">
            <h3 id="lengths-title">Timer lengths</h3>
            <span>1–180 min</span>
          </div>
          <div className="pref-card">
            {modes.map((mode) => (
              <DurationRow
                key={mode}
                mode={mode}
                value={settings.durations[mode]}
                onChange={(change) => onDuration(mode, change)}
              />
            ))}
          </div>
          {paused && <p className="pref-note">Your paused session keeps its original length.</p>}
        </section>
        <section aria-labelledby="sounds-title">
          <div className="pref-section-head">
            <h3 id="sounds-title">Sound &amp; alerts</h3>
          </div>
          <div className="pref-card">
            <Switch
              label="Interaction sounds"
              checked={settings.interactionSounds}
              ownSound
              onClick={() => onSound("interactionSounds")}
            />
            <Switch
              label="Completion chime"
              checked={settings.sound}
              ownSound
              onClick={() => onSound("sound")}
            />
            <div className="pref-volume">
              <label htmlFor="sound-volume">Volume</label>
              <output htmlFor="sound-volume">{settings.volume}%</output>
              <input
                id="sound-volume"
                type="range"
                min="0"
                max="100"
                value={settings.volume}
                aria-valuetext={`${settings.volume}%`}
                onChange={(e) => onVolume(Number(e.target.value))}
              />
              <button className="pref-preview" type="button" data-own-sound onClick={previewChime}>
                <svg
                  viewBox="0 0 16 16"
                  width="12"
                  height="12"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M4 2.8a.8.8 0 0 1 1.2-.7l8 5.2a.8.8 0 0 1 0 1.4l-8 5.2a.8.8 0 0 1-1.2-.7z" />
                </svg>
                Preview chime
              </button>
            </div>
            <Switch
              label="Desktop notifications"
              checked={settings.notifications}
              onClick={onNotifications}
            />
            {notificationMessage && (
              <p className="pref-note" role="status">
                {notificationMessage}
              </p>
            )}
          </div>
        </section>
        <section aria-labelledby="profile-section-title">
          <div className="pref-section-head">
            <h3 id="profile-section-title">Profile</h3>
          </div>
          {children}
        </section>
      </div>
    </Dialog>
  );
}

# pomo. — Make room for focus

A calm, responsive Pomodoro timer built with React, TypeScript, Tailwind CSS 4, and Vite.

## What changed

- **First-run welcome:** a quiet, Apple-inspired onboarding screen asks for the user's name, then remembers it locally.
- **Immersive focus mode:** when the timer starts, the side panels glide outward and recede, the timer ring grows with a gentle lime halo, and a soft neutral vignette lowers the visual noise without hiding tasks or stats. Pausing returns the dashboard to its normal composition; reduced-motion preferences are respected by the global stylesheet.
- **Timer that survives refresh:** the active session's deadline, selected mode, and remaining time are saved locally, so reopening the app doesn't silently restart a running session.
- **Useful session behaviour:** focus / short break / long break modes, pause, reset, skip, end-of-session feedback, focus-session counts, and focused minutes for today.
- **Real task list:** add, rename, select, complete, and delete tasks. The current task is highlighted and the next open task is offered.
- **Settings:** configure each session length, enable a gentle completion chime, and request desktop notifications.
- **Persistence:** name, settings, tasks, active task, daily stats, and timer state live in browser `localStorage`. No account or backend is required.
- **PWA basics:** manifest, install icons, service-worker registration, and cache-first shell support for repeat/offline visits after the app has loaded once.
- **Responsive and accessible details:** keyboard shortcuts, focus-visible styles, labels for icon controls, reduced-motion support, and mobile layouts.

## Run locally

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
npm run preview
```

## Keyboard shortcuts

- `Space` — start / pause the timer
- `R` — reset the current session
- `N` — skip to the next session
- `Escape` — close settings or the name editor

Shortcuts are ignored while typing in fields or while a modal is open.

## Applying this to the existing Figma Make project

For the existing Make project, the safest first step is to replace the contents of **`src/App.tsx`** and **`src/index.css`** with the versions in this package. Keep Figma Make's own `vite.config.ts` and project shell; its managed config differs from this package's plain local Vite config. The optional PWA files are `public/manifest.webmanifest`, `public/sw.js`, and `public/icons/`; `src/main.tsx` contains the service-worker registration for a standalone production build.

The app has no database or external API requirement. Google Fonts are optional: the CSS includes system-font fallbacks.

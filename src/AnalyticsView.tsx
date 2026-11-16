import { useMemo, useState } from "react";
import { dailyQuits, formatTime, summary, verdict } from "./analytics.ts";
import { dayDate, weekDays } from "./calendar.ts";
import { Dialog } from "./Dialog";
import type { State } from "./model.ts";

export function AnalyticsView({
  data,
  today,
  onClose,
}: {
  data: State;
  today: string;
  onClose: () => void;
}) {
  const [selected, select] = useState(today);
  const days = weekDays(today);
  const day = days.includes(selected) ? selected : today;
  const report = useMemo(() => {
    const keys = weekDays(today);
    return {
      week: summary(data, keys[0], keys[6]),
      lifetime: summary(data),
      days: keys.map((key) => ({ key, ...summary(data, key, key) })),
      quits: dailyQuits(data.history, today),
      last: verdict(data, today),
    };
  }, [data, today]);
  const detail = report.days.find((d) => d.key === day)!;
  return (
    <Dialog full titleId="analytics-title" onClose={onClose}>
      <main className="analytics-page">
        <header>
          <h1 id="analytics-title">Analytics</h1>
          <button className="small-save-button" onClick={onClose} autoFocus>
            Back to timer
          </button>
        </header>
        <section>
          <h2>This week</h2>
          <p>
            {days[0]} – {days[6]}
          </p>
          <dl className="metric-list">
            <div>
              <dt>Focus time</dt>
              <dd>{formatTime(report.week.activeMs)}</dd>
            </div>
            <div>
              <dt>Finished sessions</dt>
              <dd>{report.week.finished}</dd>
            </div>
            <div>
              <dt>Focus quits</dt>
              <dd>{report.week.quits}</dd>
            </div>
          </dl>
          <p>
            Lifetime recorded focus time · <strong>{formatTime(report.lifetime.activeMs)}</strong>
          </p>
        </section>
        <section>
          <h2>Daily focus</h2>
          <p>A green day marks at least one finished Focus session.</p>
          <div className="contribution-week" role="group" aria-label="Choose a day">
            {report.days.map((d) => (
              <button
                key={d.key}
                aria-pressed={day === d.key}
                className={d.finished ? "contributed" : ""}
                aria-label={`${d.key}, ${d.finished} finished`}
                onClick={() => select(d.key)}
              >
                <span>
                  {dayDate(d.key).toLocaleDateString(undefined, {
                    weekday: "short",
                  })}
                </span>
                <strong>{dayDate(d.key).getDate()}</strong>
              </button>
            ))}
          </div>
          <p role="status">
            {dayDate(day).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}{" "}
            · {formatTime(detail.activeMs)} focus · {detail.finished} finished · {detail.quits}{" "}
            quits
          </p>
        </section>
        <section>
          <h2>Today’s Focus quits</h2>
          {report.quits.length ? (
            <ol>
              {report.quits.map((q) => (
                <li key={q.id}>
                  <strong>{q.label}</strong> {q.category}. {q.line}
                </li>
              ))}
            </ol>
          ) : (
            <p>No deliberate Focus quits today.</p>
          )}
        </section>
        <section>
          <h2>Last week’s verdict</h2>
          <p>
            {report.last.start} – {report.last.end}
          </p>
          <p>{report.last.text}</p>
        </section>
        <p>
          Focus time counts active time in finished and deliberately quit Focus sessions. Pauses,
          breaks and discarded sessions earn no credit. Each session belongs to its local end date.
          V2 summaries contribute recorded minutes and finishes. Quit tracking began in V3.
        </p>
      </main>
    </Dialog>
  );
}

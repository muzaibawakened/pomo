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
  const dateLabel = (key: string, options: Intl.DateTimeFormatOptions) =>
    dayDate(key).toLocaleDateString(undefined, options);
  const weekRange = (start: string, end: string) =>
    [start, end].map((key) => dateLabel(key, { month: "short", day: "numeric" })).join(" – ");
  return (
    <Dialog full titleId="analytics-title" onClose={onClose}>
      <main className="analytics-page">
        <nav aria-label="Analytics navigation">
          <span className="wordmark">
            pomo<span>.</span>
          </span>
          <button className="report-back" onClick={onClose} autoFocus>
            <span aria-hidden="true">←</span> Back to timer
          </button>
        </nav>
        <header className="report-heading">
          <h1 id="analytics-title">
            Analytics<span aria-hidden="true">.</span>
          </h1>
          <p>{weekRange(days[0], days[6])}</p>
        </header>
        <section className="week-summary" aria-labelledby="week-title">
          <h2 id="week-title">This week</h2>
          <dl className="metric-list">
            <div className="lead-metric">
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
          <p className="lifetime-total">
            Lifetime recorded focus time <strong>{formatTime(report.lifetime.activeMs)}</strong>
          </p>
        </section>
        <section className="activity-section">
          <div className="activity-heading">
            <h2>Daily focus</h2>
            <span className="activity-legend">Finished session</span>
          </div>
          <div className="contribution-week" role="group" aria-label="Choose a day">
            {report.days.map((d) => (
              <button
                key={d.key}
                aria-pressed={day === d.key}
                className={d.finished ? "contributed" : ""}
                aria-label={`${d.key}, ${d.finished} finished`}
                onClick={() => select(d.key)}
              >
                <span>{dateLabel(d.key, { weekday: "short" })}</span>
                <strong>{dayDate(d.key).getDate()}</strong>
              </button>
            ))}
          </div>
          <p className="day-detail" role="status">
            <strong>{dateLabel(day, { weekday: "long" })}</strong>
            <span>
              {formatTime(detail.activeMs)} focus · {detail.finished} finished · {detail.quits}{" "}
              {detail.quits === 1 ? "quit" : "quits"}
            </span>
          </p>
          {report.week.finished === 0 && (
            <p className="week-empty">Your first finish this week will light up its day.</p>
          )}
        </section>
        <div className="history-columns">
          <section className="quit-journal">
            <h2>Today’s Focus quits</h2>
            {report.quits.length ? (
              <ol>
                {report.quits.map((q) => (
                  <li key={q.id}>
                    <strong>{q.label}</strong>
                    <small>{q.category}</small>
                    <p>{q.line}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No deliberate Focus quits today.</p>
            )}
          </section>
          <section className="week-verdict">
            <h2>Last week’s verdict</h2>
            <p>{report.last.text}</p>
            <small>{weekRange(report.last.start, report.last.end)}</small>
          </section>
        </div>
        <details className="metric-guide">
          <summary>How focus time is counted</summary>
          <p>
            Focus time counts active time in finished and deliberately quit Focus sessions. Each
            session belongs to its local end date. Pauses, breaks and discarded sessions earn no
            credit. V2 summaries contribute recorded minutes and finishes. Quit tracking began in
            V3.
          </p>
        </details>
      </main>
    </Dialog>
  );
}

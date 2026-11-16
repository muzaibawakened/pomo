import { useEffect, useState } from "react";

export function LocalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timeout: number;
    function synchronize() {
      window.clearTimeout(timeout);
      const value = new Date();
      setNow(value);
      timeout = window.setTimeout(synchronize, 60_000 - (value.getTime() % 60_000));
    }
    synchronize();
    document.addEventListener("visibilitychange", synchronize);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", synchronize);
    };
  }, []);
  return (
    <time className="local-clock" dateTime={now.toISOString()}>
      <span>
        {now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
      </span>
      <span>{now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
    </time>
  );
}

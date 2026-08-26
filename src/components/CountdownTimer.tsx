"use client";

import { useEffect, useRef, useState } from "react";

interface CountdownTimerProps {
  endsAt: string;
  /** Client-clock-minus-server-clock offset in ms, so drift on someone's
   * phone doesn't change what "closes in" means. */
  clockOffsetMs: number;
  onExpire?: () => void;
  compact?: boolean;
}

function partsFor(msRemaining: number) {
  const clamped = Math.max(0, msRemaining);
  const totalSeconds = Math.floor(clamped / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, expired: clamped <= 0 };
}

export function CountdownTimer({ endsAt, clockOffsetMs, onExpire, compact }: CountdownTimerProps) {
  const [now, setNow] = useState(() => Date.now() - clockOffsetMs);
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now() - clockOffsetMs), 1000);
    return () => clearInterval(interval);
  }, [clockOffsetMs]);

  const remaining = new Date(endsAt).getTime() - now;
  const { days, hours, minutes, seconds, expired } = partsFor(remaining);

  useEffect(() => {
    if (expired && !hasExpiredRef.current) {
      hasExpiredRef.current = true;
      onExpire?.();
    }
  }, [expired, onExpire]);

  if (expired) {
    return (
      <span className={compact ? "text-sm font-semibold text-danger" : "font-semibold text-danger"}>
        Auction closed
      </span>
    );
  }

  const urgent = remaining < 2 * 60 * 1000;

  return (
    <span
      className={`font-mono font-semibold tabular-nums ${urgent ? "text-danger" : ""} ${
        compact ? "text-sm" : "text-lg"
      }`}
    >
      {days > 0 && `${days}d `}
      {String(hours).padStart(2, "0")}h {String(minutes).padStart(2, "0")}m{" "}
      {String(seconds).padStart(2, "0")}s
    </span>
  );
}

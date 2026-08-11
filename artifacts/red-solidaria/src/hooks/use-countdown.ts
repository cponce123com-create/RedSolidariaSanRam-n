import { useEffect, useState } from "react";

export interface CountdownState {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  expired: boolean;
}

function computeRemaining(target: string | null | undefined): number {
  if (!target) return 0;
  const end = new Date(target).getTime();
  if (Number.isNaN(end)) return 0;
  return end - Date.now();
}

/**
 * Countdown en tiempo real hacia `target` (ISO string). Hace tick cada segundo;
 * `expired` pasa a `true` cuando la cuenta llega a 0 (o si `target` es
 * null/undefined). Devuelve valores ya descompuestos para render directo.
 */
export function useCountdown(target: string | null | undefined): CountdownState {
  const [totalMs, setTotalMs] = useState(() => computeRemaining(target));

  useEffect(() => {
    if (!target) return;
    setTotalMs(computeRemaining(target));
    const id = setInterval(() => {
      setTotalMs(computeRemaining(target));
    }, 1000);
    return () => clearInterval(id);
  }, [target]);

  const clamped = Math.max(0, totalMs);
  const secondsTotal = Math.floor(clamped / 1000);
  return {
    days: Math.floor(secondsTotal / 86_400),
    hours: Math.floor((secondsTotal % 86_400) / 3_600),
    minutes: Math.floor((secondsTotal % 3_600) / 60),
    seconds: secondsTotal % 60,
    totalMs: clamped,
    expired: !target || clamped <= 0,
  };
}

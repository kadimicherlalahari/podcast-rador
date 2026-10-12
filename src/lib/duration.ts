// YouTube ISO-8601 duration, e.g. PT1H2M3S, PT45S, P0D. Returns null if unparseable.
export function parseIsoDuration(s?: string | null): number | null {
  const m = s?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!m) return null;
  const [, d, h, min, sec] = m;
  return Math.round(Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(sec ?? 0));
}

// RSS itunes:duration: "HH:MM:SS", "MM:SS" or plain seconds.
export function parseClockDuration(s?: string | number | null): number | null {
  if (s === undefined || s === null || s === "") return null;
  const parts = String(s).trim().split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return Math.round(parts.reduce((acc, p) => acc * 60 + Number(p), 0));
}

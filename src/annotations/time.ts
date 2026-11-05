export interface TimeRange {
  start: number;
  end: number | null;
}

/** The `#t=start[,end]` range of a target or chapter item, if it has one. */
export const timeRange = (target: unknown): TimeRange | null => {
  let value = '';
  if (typeof target === 'string') {
    value = target;
  } else if (target && typeof target === 'object') {
    const resource = target as { id?: string; source?: unknown; selector?: unknown };
    const selector = (Array.isArray(resource.selector) ? resource.selector[0] : resource.selector) as
      | { value?: string }
      | undefined;
    value = selector?.value
      ? `#${selector.value}`
      : resource.id || (typeof resource.source === 'string' ? resource.source : '') || '';
  }
  const match = value.match(/[#&]?t=(?:npt:)?([\d.]+)(?:,([\d.]+))?/);
  return match ? { start: Number(match[1]), end: match[2] ? Number(match[2]) : null } : null;
};

/**
 * Seconds as `m:ss`, or `h:mm:ss` from an hour. With `fraction`, any part of a
 * second is kept to the millisecond (`57:32.48`), as a time field shows it.
 */
export const formatTime = (time = 0, { fraction = false } = {}): string => {
  const ms = Math.max(0, Math.round((Number.isFinite(time) ? time : 0) * 1000));
  const n = fraction ? Math.floor(ms / 1000) : Math.floor(Math.max(0, time));
  const h = Math.floor(n / 3600);
  const m = Math.floor(n / 60) % 60;
  const s = String(n % 60).padStart(2, '0');
  const part = fraction && ms % 1000 ? `.${String(ms % 1000).padStart(3, '0').replace(/0+$/, '')}` : '';
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + `:${s}${part}`;
};

/**
 * A time typed as `h:mm:ss`, `m:ss` or seconds, each with an optional fraction
 * (`1:02:05.5`), in seconds to the millisecond. Null when it can't be read.
 */
export const parseTime = (value: string): number | null => {
  const parts = value.trim().split(':');
  if (parts.length > 3 || !/^(\d+(\.\d*)?|\.\d+)$/.test(parts.at(-1) ?? '')) return null;
  if (parts.slice(0, -1).some((part) => !/^\d+$/.test(part))) return null;
  const numbers = parts.map(Number);
  /* After the first part, minutes and seconds stay under 60. */
  if (numbers.slice(1).some((n) => n >= 60)) return null;
  const seconds = numbers.reduce((total, n) => total * 60 + n, 0);
  return Math.round(seconds * 1000) / 1000;
};

export type TimeProblem = 'start' | 'startAfterEnd' | 'end' | null;

/** Which time input is wrong, if any. `duration` 0 means "not known yet". */
export const validateTime = (
  start: string | number,
  end: string | number,
  duration: number,
): TimeProblem => {
  const s = Number(start);
  if (String(start).trim() === '' || !Number.isFinite(s) || s < 0) return 'start';
  if (duration > 0 && s >= duration) return 'startAfterEnd';
  if (String(end).trim() === '') return null;
  const e = Number(end);
  if (!Number.isFinite(e) || e <= s || (duration > 0 && e > duration)) return 'end';
  return null;
};

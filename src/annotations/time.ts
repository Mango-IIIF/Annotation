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

export const formatTime = (time = 0): string => {
  const n = Math.max(0, Math.floor(time));
  return [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
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

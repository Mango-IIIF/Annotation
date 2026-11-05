import { describe, expect, it } from 'vitest';
import { formatTime, parseTime } from '../src/annotations/time';

describe('clock times', () => {
  it('shows times as clock times, and reads them back', () => {
    expect(formatTime(3725.9)).toBe('1:02:05');
    expect(formatTime(3452)).toBe('57:32');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(3452.48, { fraction: true })).toBe('57:32.48');
    expect(formatTime(3452, { fraction: true })).toBe('57:32');
    expect(formatTime(59.9996, { fraction: true })).toBe('1:00');

    expect(parseTime('1:02:05')).toBe(3725);
    expect(parseTime('62:05')).toBe(3725);
    expect(parseTime('3725')).toBe(3725);
    expect(parseTime(' 1:02:05.5 ')).toBe(3725.5);
    expect(parseTime('0:00.125')).toBe(0.125);
    expect(parseTime(formatTime(3452.48, { fraction: true }))).toBe(3452.48);
    for (const bad of ['', 'abc', '1:60', '1:02:60', '1:2:3:4', '-5', '1.5:00', '1::05']) {
      expect(parseTime(bad)).toBeNull();
    }
  });
});

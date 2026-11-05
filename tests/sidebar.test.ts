import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Harness from './SidebarHarness.svelte';

let component: ReturnType<typeof mount>;
afterEach(async () => {
  if (component) await unmount(component);
  document.body.innerHTML = '';
});

const setup = () => {
  const onsave = vi.fn();
  component = mount(Harness, { target: document.body, props: { onsave } });
  flushSync();
  const start = document.querySelector<HTMLInputElement>('input[aria-label="Start"]')!;
  const end = document.querySelector<HTMLInputElement>('input[aria-label="End (optional)"]')!;
  const stored = (field: string) => document.querySelector('[data-testid="' + field + '"]')!.textContent;
  const change = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
  };
  return { start, end, stored, change, onsave };
};

describe('sidebar clock times', () => {
  it('shows clock times but binds seconds, including fractions and an open end', () => {
    const { start, end, stored, change } = setup();
    expect(start.value).toBe('57:32.48');
    expect(end.value).toBe('');
    change(start, '3725');
    expect(start.value).toBe('1:02:05');
    expect(stored('start')).toBe('3725');
    change(end, '1:03:05.125');
    expect(end.value).toBe('1:03:05.125');
    expect(stored('end')).toBe('3785.125');
    change(end, '');
    expect(stored('end')).toBe('');
    expect(end.getAttribute('aria-invalid')).toBe('false');
  });

  it('preserves invalid text and bound values, blocks saving, and recovers', () => {
    const { start, end, stored, change, onsave } = setup();
    for (const text of ['abc', '1:60', '-5', '']) {
      change(start, text);
      expect(start.value).toBe(text);
      expect(stored('start')).toBe('3452.48');
      expect(start.getAttribute('aria-invalid')).toBe('true');
      expect(document.getElementById(start.getAttribute('aria-describedby')!)!.textContent)
        .toBe('Enter a time such as 1:02:05, 2:05 or 125.');
      document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      expect(onsave).not.toHaveBeenCalled();
    }
    change(start, '3452.48');
    expect(start.value).toBe('57:32.48');
    expect(start.getAttribute('aria-invalid')).toBe('false');
    change(end, 'bad');
    expect(stored('end')).toBe('');
    expect(end.value).toBe('bad');
    change(end, '');
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onsave).toHaveBeenCalledOnce();
  });

  it('rounds the playhead and updates fields when the host loads another range', () => {
    const { start, end, stored, change } = setup();
    change(start, 'bad');
    const buttons = Array.from(document.querySelectorAll('button'));
    buttons.filter((button) => button.textContent?.includes('Use current time'))
      .forEach((button) => button.click());
    flushSync();
    expect(stored('start')).toBe('3453');
    expect(stored('end')).toBe('3453');
    expect(start.value).toBe('57:33');
    expect(end.value).toBe('57:33');
    expect(start.getAttribute('aria-invalid')).toBe('false');
    buttons.find((button) => button.textContent === 'Load range')!.click();
    flushSync();
    expect(start.value).toBe('1:02:05');
    expect(end.value).toBe('1:03:20.125');
  });
});

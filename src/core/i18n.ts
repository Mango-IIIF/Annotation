import { derived, get, writable } from 'svelte/store';
import en from '../locales/en.json';
import es from '../locales/es.json';
import cy from '../locales/cy.json';
import fr from '../locales/fr.json';
import ja from '../locales/ja.json';

type Params = Record<string, string | number | undefined>;
type MessageTree = string | { [key: string]: MessageTree };
type MessageValue = MessageTree | undefined;

const catalogue: Record<string, MessageTree> = { en, es, cy, fr, ja };
const fallbackLocale = 'en';

export const locale = writable('en');
const overridesStore = writable<Record<string, MessageTree>>({});

const normaliseLocale = (value: string): string =>
  value.trim().replace('_', '-').toLowerCase();

export const setLocale = (value: string) => locale.set(value);
export const getLocale = () => get(locale);

export const setLocaleOverrides = (localeCode: string, overrides: MessageTree): void => {
  const code = normaliseLocale(localeCode);
  overridesStore.update((current) => ({ ...current, [code]: overrides }));
};

export const clearLocaleOverrides = (localeCode?: string): void => {
  if (!localeCode) {
    overridesStore.set({});
    return;
  }
  const code = normaliseLocale(localeCode);
  overridesStore.update((current) => {
    const next = { ...current };
    delete next[code];
    return next;
  });
};

const resolveLocale = (value: string): string => {
  const normalised = normaliseLocale(value);
  if (catalogue[normalised] || get(overridesStore)[normalised]) return normalised;
  const base = normalised.split('-')[0];
  return base && (catalogue[base] || get(overridesStore)[base]) ? base : fallbackLocale;
};

const lookup = (messages: MessageTree | undefined, key: string): MessageValue => {
  if (!messages) return undefined;
  return key.split('.').reduce<MessageValue>(
    (acc, part) =>
      acc && typeof acc === 'object' ? (acc as Record<string, MessageTree>)[part] : undefined,
    messages,
  );
};

const format = (template: string, params?: Params) =>
  params
    ? template.replace(/\{(\w+)\}/g, (match, key) =>
        params[key] == null ? match : String(params[key]),
      )
    : template;

const resolveValue = (
  value: MessageValue,
  resolvedLocale: string,
  params?: Params,
): string | undefined => {
  if (typeof value === 'string') return format(value, params);
  if (value && typeof value === 'object' && typeof params?.count === 'number') {
    const category = new Intl.PluralRules(resolvedLocale).select(params.count);
    const template = value[category] ?? value.other;
    if (typeof template === 'string') return format(template, params);
  }
  return undefined;
};

export const translate = (key: string, params?: Params, overrideLocale?: string): string => {
  const active = resolveLocale(overrideLocale ?? get(locale));
  const overrides = get(overridesStore);
  const fromOverride =
    resolveValue(lookup(overrides[active], key), active, params) ??
    resolveValue(lookup(overrides[fallbackLocale], key), fallbackLocale, params);
  if (fromOverride !== undefined) return fromOverride;

  const fromCatalogue =
    resolveValue(lookup(catalogue[active], key), active, params) ??
    resolveValue(lookup(catalogue[fallbackLocale], key), fallbackLocale, params);
  return fromCatalogue ?? key;
};

export const t = derived([locale, overridesStore], ([$locale]) =>
  (key: string, params?: Params): string => translate(key, params, $locale),
);

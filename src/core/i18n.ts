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
export const setLocale = (value: string) => locale.set(value);
export const getLocale = () => get(locale);

const resolveLocale = (value: string): string => {
  const normalised = value.trim().replace('_', '-').toLowerCase();
  if (catalogue[normalised]) return normalised;
  return catalogue[normalised.split('-')[0]] ? normalised.split('-')[0] : fallbackLocale;
};

const lookup = (messages: MessageTree, key: string): MessageValue =>
  key.split('.').reduce<MessageValue>((acc, part) =>
    acc && typeof acc === 'object' ? (acc as Record<string, MessageTree>)[part] : undefined,
  messages);

const format = (template: string, params?: Params) =>
  params ? template.replace(/\{(\w+)\}/g, (match, key) => params[key] == null ? match : String(params[key])) : template;

export const translate = (key: string, params?: Params, overrideLocale?: string): string => {
  const active = resolveLocale(overrideLocale ?? get(locale));
  const value = lookup(catalogue[active], key) ?? lookup(catalogue[fallbackLocale], key);
  return typeof value === 'string' ? format(value, params) : key;
};

export const t = derived(locale, ($locale) =>
  (key: string, params?: Params): string => translate(key, params, $locale));

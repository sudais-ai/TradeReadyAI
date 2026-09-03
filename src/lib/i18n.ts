import en from "@/locales/en.json";
import es from "@/locales/es.json";

export const dictionaries = { en, es };
export type Locale = keyof typeof dictionaries;

export const LOCALES: Locale[] = ["en", "es"];
export const DEFAULT_LOCALE: Locale = "en";

export type Dictionary = typeof en;

export function getDictionary(locale: string): Dictionary {
  if (locale in dictionaries) {
    return dictionaries[locale as Locale];
  }
  return dictionaries[DEFAULT_LOCALE];
}

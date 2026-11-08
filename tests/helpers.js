import { readFileSync } from "node:fs";

export function catalog(locale) {
  return JSON.parse(readFileSync(new URL(`../_locales/${locale}/messages.json`, import.meta.url), "utf8"));
}

// Simulates Chrome's message catalog selection, including the default locale.
export function mockI18n(locale = "zh-CN") {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true, value: { language: locale, languages: [locale] }
  });
  const name = /^zh[-_](TW|HK|MO)/i.test(locale) ? "zh_TW"
    : /^zh/i.test(locale) ? "zh_CN" : "en";
  const messages = catalog(name);
  return {
    getUILanguage: () => locale,
    getMessage: key => key === "@@ui_locale" ? locale : messages[key]?.message || ""
  };
}

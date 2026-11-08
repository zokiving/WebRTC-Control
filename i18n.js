import { messages } from "./messages.js";

export function resolveLocale(language) {
  const normalized = String(language || "").trim().replaceAll("_", "-");
  if (!/^zh(?:-|$)/i.test(normalized)) return "en";
  return /(?:^|-)(?:TW|HK|MO|Hant)(?:-|$)/i.test(normalized) ? "zh_TW" : "zh_CN";
}

export function getLocale() {
  // Follow the user's first preferred language. Chrome's UI locale and the
  // user's preferred language can differ (for example zh-CN versus zh-TW).
  const firstPreferred = globalThis.navigator?.languages?.[0];
  if (typeof firstPreferred === "string" && firstPreferred.trim()) return resolveLocale(firstPreferred);
  const preferred = globalThis.navigator?.language;
  if (typeof preferred === "string" && preferred.trim()) return resolveLocale(preferred);
  let uiLanguage;
  try { uiLanguage = globalThis.chrome?.i18n?.getUILanguage?.(); } catch { /* Default to English. */ }
  return resolveLocale(uiLanguage);
}

// Use bundled messages directly. Native catalog lookups may be unavailable
// or return empty strings; never expose message keys to the user.
export function t(key) {
  return messages[getLocale()][key] || messages.en[key] || messages[getLocale()].errorGeneric;
}

export function localizePage(root = document) {
  root.documentElement.lang = getLocale().replaceAll("_", "-");
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.getAttribute("data-i18n"));
  }
}

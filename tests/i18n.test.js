import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalog, mockI18n } from "./helpers.js";
import { t, getLocale, resolveLocale } from "../i18n.js";
import { messages } from "../messages.js";
import { enableRestriction, getState } from "../policy.js";

beforeEach(() => { globalThis.chrome = { i18n: mockI18n() }; });

function prefer(languages, language) {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { languages, language } });
}

test("every translation has the same non-empty message keys", () => {
  const english = catalog("en");
  for (const language of ["en", "zh_CN", "zh_TW"]) {
    const messages = catalog(language);
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(english).sort());
    for (const message of Object.values(messages)) assert.ok(message.message.trim());
  }
  const html = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
  for (const [, key] of html.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(english[key], key);
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.default_locale, "en");
  assert.deepEqual(manifest.permissions, ["privacy"]);
});

test("bundled dictionaries match the source catalogs exactly", () => {
  for (const locale of ["en", "zh_CN", "zh_TW"]) {
    const expected = Object.fromEntries(Object.entries(catalog(locale)).map(([key, value]) => [key, value.message]));
    assert.deepEqual(messages[locale], expected);
  }
});

test("Chinese UI keeps all labels when native message lookup returns empty strings", () => {
  globalThis.chrome = { i18n: { getUILanguage: () => "zh-CN", getMessage: () => "" } };
  assert.equal(getLocale(), "zh_CN");
  assert.equal(t("statusOriginal"), "使用原设置");
  assert.equal(t("descriptionOriginal"), "尚未启用限制，遵循浏览器原策略。");
  assert.equal(t("tip"), "仅限制非代理 UDP · 切换后请刷新网页");
  assert.equal(t("detailsTitle"), "功能说明");
  assert.equal(t("privacy"), "本地运行 · 不收集浏览记录");
  assert.equal(t("missingKey"), "操作失败，请重试。");
});

test("language matching covers Chinese scripts and regions", () => {
  for (const locale of ["zh", "zh-CN", "zh_SG", "zh-Hans-CN"]) assert.equal(resolveLocale(locale), "zh_CN");
  for (const locale of ["zh-TW", "zh_HK", "zh-MO", "zh-Hant", "zh-Hant-HK"]) assert.equal(resolveLocale(locale), "zh_TW");
  for (const locale of ["en-US", "de", "fr-FR", "", undefined]) assert.equal(resolveLocale(locale), "en");
});

test("preferred language does not depend on native catalog metadata", () => {
  globalThis.chrome = { i18n: { getUILanguage: () => "zh-CN", getMessage: () => "en" } };
  assert.equal(t("enable"), "启用限制");
});

test("reported Chrome zh-CN with preferred zh-TW selects Traditional Chinese", () => {
  chrome.i18n.getUILanguage = () => "zh-CN";
  prefer(["zh-TW", "zh-CN", "en-US", "zh"], "zh-TW");
  assert.equal(getLocale(), "zh_TW");
  assert.equal(t("restore"), "還原設定");
  assert.equal(t("privacy"), "本機執行 · 不收集瀏覽紀錄");
  assert.equal(t("toolbarOriginal"), "WebRTC：使用原有設定");
});

test("first preferred language wins, including unsupported and non-Chinese languages", () => {
  chrome.i18n.getUILanguage = () => "zh-TW";
  for (const [languages, expected] of [
    [["zh-CN", "zh-TW"], "zh_CN"],
    [["en-US", "zh-TW"], "en"],
    [["fr-FR", "zh-CN"], "en"],
    [["zh-Hant-HK", "zh-CN"], "zh_TW"]
  ]) {
    prefer(languages, "zh-CN");
    assert.equal(getLocale(), expected);
  }
});

test("navigator.language is used if the preferred language list is absent or empty", () => {
  chrome.i18n.getUILanguage = () => "en-US";
  for (const languages of [undefined, [], [""]]) {
    prefer(languages, "zh-Hant");
    assert.equal(getLocale(), "zh_TW");
  }
});

test("service worker can fall back to the Chrome UI locale when navigator has no languages", () => {
  prefer([], "");
  chrome.i18n.getUILanguage = () => "zh-TW";
  assert.equal(getLocale(), "zh_TW");
  assert.equal(t("toolbarRestricted"), "WebRTC：已限制非代理 UDP");
  chrome.i18n.getUILanguage = () => "en-US";
  assert.equal(getLocale(), "en");
});

test("missing or throwing language APIs fall back to readable English", () => {
  prefer(undefined, undefined);
  chrome.i18n.getUILanguage = () => { throw new Error("Unavailable"); };
  assert.equal(getLocale(), "en");
  assert.equal(t("restore"), "Restore settings");
  globalThis.chrome = {};
  assert.equal(getLocale(), "en");
});

test("navigator is used when the browser UI language API is missing or fails", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language: "zh-CN" } });
    globalThis.chrome = {};
    assert.equal(t("restore"), "恢复原设置");
    globalThis.chrome.i18n = { getUILanguage() { throw new Error("Unavailable"); } };
    assert.equal(t("privacy"), "本地运行 · 不收集浏览记录");
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  }
});

test("known policy errors are translated in an English browser", async () => {
  globalThis.chrome = { i18n: mockI18n("en-GB") };
  await assert.rejects(getState(), /does not support WebRTC privacy settings/);
  chrome.privacy = { network: { webRTCIPHandlingPolicy: {
    get: async () => ({ value: "default", levelOfControl: "not_controllable" })
  } } };
  await assert.rejects(enableRestriction(), /Another extension or browser policy/);
});

test("toolbar strings follow the current browser message catalog", () => {
  globalThis.chrome = { i18n: mockI18n("en-US") };
  assert.equal(t("toolbarRestricted"), "WebRTC: non-proxied UDP restricted");
  globalThis.chrome.i18n = mockI18n("zh-CN");
  assert.equal(t("toolbarOriginal"), "WebRTC：使用原设置");
});

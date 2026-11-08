import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mockI18n } from "./helpers.js";

async function openPopup({ restricted = false, locked = false, failSet = false, locale = "zh-CN", uiLocale = locale, emptyMessages = false } = {}) {
  let owned = false;
  let value = restricted ? "disable_non_proxied_udp" : "default";
  let completeSet;
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      disabled: true, textContent: "", hidden: true, attributes: {}, handlers: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name]; },
      addEventListener(name, fn) { this.handlers[name] = fn; }
    });
    return elements.get(id);
  };
  const html = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
  const localizedElements = [...html.matchAll(/<[^>]*data-i18n="([^"]+)"[^>]*>/g)].map(([tag, key]) => {
    const id = /\bid="([^"]+)"/.exec(tag)?.[1] || key;
    const target = element(id);
    target.setAttribute("data-i18n", key);
    return target;
  });
  globalThis.document = { getElementById: element, documentElement: {}, querySelectorAll: () => localizedElements };
  globalThis.chrome = { i18n: mockI18n(locale), privacy: { network: { webRTCIPHandlingPolicy: {
    async get() {
      return { value, levelOfControl: locked ? "controlled_by_other_extensions"
        : owned ? "controlled_by_this_extension" : "controllable_by_this_extension" };
    },
    async set({ value: next }) {
      if (failSet) throw new Error("Setting failed");
      await new Promise(resolve => { completeSet = resolve; });
      value = next;
      owned = true;
    },
    async clear() { value = "default"; owned = false; },
    onChange: { addListener() {} }
  } } } };
  chrome.i18n.getUILanguage = () => uiLocale;
  if (emptyMessages) chrome.i18n.getMessage = () => "";
  await import(`../popup.js?test=${Math.random()}`);
  await new Promise(resolve => setImmediate(resolve));
  return {
    element,
    release: () => completeSet(),
    tick: () => new Promise(resolve => setImmediate(resolve)),
    click: id => {
      assert.equal(element(id).disabled, false, `${id} should be clickable`);
      return element(id).handlers.click();
    }
  };
}

test("buttons alternate and both stay disabled during an operation", async () => {
  const ui = await openPopup();
  assert.equal(ui.element("enable").disabled, false);
  assert.equal(ui.element("restore").disabled, true);
  const enabling = ui.click("enable");
  assert.equal(ui.element("enable").disabled, true);
  assert.equal(ui.element("restore").disabled, true);
  await ui.tick();
  ui.release();
  await enabling;
  assert.equal(ui.element("enable").disabled, true);
  assert.equal(ui.element("restore").disabled, false);
  await ui.click("restore");
  assert.equal(ui.element("enable").disabled, false);
  assert.equal(ui.element("restore").disabled, true);
});

test("failed enable keeps restore disabled and allows retry", async () => {
  const ui = await openPopup({ failSet: true });
  await ui.click("enable");
  assert.equal(ui.element("enable").disabled, false);
  assert.equal(ui.element("restore").disabled, true);
  assert.equal(ui.element("error").hidden, false);
});

test("external control does not offer either action", async () => {
  const ui = await openPopup({ locked: true });
  assert.equal(ui.element("enable").disabled, true);
  assert.equal(ui.element("restore").disabled, true);
});

test("a pre-existing browser restriction cannot be restored by this extension", async () => {
  const ui = await openPopup({ restricted: true });
  assert.equal(ui.element("enable").disabled, true);
  assert.equal(ui.element("restore").disabled, true);
  assert.match(ui.element("status-description").textContent, /原策略/);
});

test("English browser localizes static text, status, actions and success notices", async () => {
  const ui = await openPopup({ locale: "en-US" });
  assert.equal(document.documentElement.lang, "en");
  assert.equal(ui.element("enable").textContent, "Enable restriction");
  assert.equal(ui.element("restore").textContent, "Restore settings");
  assert.equal(ui.element("privacy").textContent, "Runs locally · No browsing history collected");
  assert.equal(ui.element("status-title").textContent, "Original settings");
  const enabling = ui.click("enable");
  await ui.tick();
  ui.release();
  await enabling;
  assert.equal(ui.element("status-title").textContent, "Non-proxied UDP restricted");
  assert.equal(ui.element("enable").textContent, "Restriction on");
  assert.equal(ui.element("notice").textContent, "Restriction is active. Reload the page.");
  await ui.click("restore");
  assert.equal(ui.element("notice").textContent, "Original settings restored. Reload the page.");
});

test("Traditional Chinese browser uses Traditional Chinese without a language control", async () => {
  const ui = await openPopup({ locale: "zh-TW" });
  assert.equal(document.documentElement.lang, "zh-TW");
  assert.equal(ui.element("restore").textContent, "還原設定");
  assert.equal(ui.element("privacy").textContent, "本機執行 · 不收集瀏覽紀錄");
});

test("popup reproduces and fixes zh-TW preference with Chrome UI still reporting zh-CN", async () => {
  const ui = await openPopup({ locale: "zh-TW", uiLocale: "zh-CN" });
  assert.equal(document.documentElement.lang, "zh-TW");
  assert.equal(ui.element("status-title").textContent, "使用原有設定");
  assert.equal(ui.element("enable").textContent, "啟用限制");
  assert.equal(ui.element("restore").textContent, "還原設定");
  assert.equal(ui.element("privacy").textContent, "本機執行 · 不收集瀏覽紀錄");
  assert.equal(ui.element("restore").disabled, true);
  const enabling = ui.click("enable");
  await ui.tick();
  ui.release();
  await enabling;
  assert.equal(ui.element("notice").textContent, "限制已生效，請重新整理網頁。");
  assert.equal(ui.element("enable").disabled, true);
  assert.equal(ui.element("restore").disabled, false);
  await ui.click("restore");
  assert.equal(ui.element("notice").textContent, "已還原設定，請重新整理網頁。");
});

test("unsupported browser language falls back to English", async () => {
  const ui = await openPopup({ locale: "fr-FR", locked: true });
  assert.equal(document.documentElement.lang, "en");
  assert.equal(ui.element("enable").textContent, "Enable restriction");
  assert.match(ui.element("status-description").textContent, /Controlled by another extension/);
  assert.equal(ui.element("enable").disabled, true);
});

test("Chinese popup survives empty native translations and preserves every hint", async () => {
  const ui = await openPopup({ locale: "zh-CN", emptyMessages: true });
  assert.equal(document.documentElement.lang, "zh-CN");
  assert.equal(ui.element("status-title").textContent, "使用原设置");
  assert.equal(ui.element("enable").textContent, "启用限制");
  assert.equal(ui.element("restore").textContent, "恢复原设置");
  assert.equal(ui.element("privacy").textContent, "本地运行 · 不收集浏览记录");
  assert.equal(ui.element("detailsTitle").textContent, "功能说明");
  assert.match(ui.element("tip").textContent, /切换后请刷新网页/);
  assert.match(ui.element("detailsLimits").textContent, /不完全关闭 WebRTC/);
  assert.match(ui.element("detailsRestore").textContent, /仅撤销本插件的修改/);
  assert.equal(ui.element("enable").disabled, false);
  assert.equal(ui.element("restore").disabled, true);
  const enabling = ui.click("enable");
  await ui.tick();
  ui.release();
  await enabling;
  assert.equal(ui.element("notice").textContent, "限制已生效，请刷新网页。");
  assert.equal(ui.element("restore").disabled, false);
});

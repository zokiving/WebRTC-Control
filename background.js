import { getState } from "./policy.js";
import { t } from "./i18n.js";

async function updateBadge() {
  try {
    const state = await getState();
    const locked = !state.canControl;
    await Promise.all([
      chrome.action.setBadgeText({ text: locked ? "!" : state.restricted ? "ON" : "" }),
      chrome.action.setBadgeBackgroundColor({ color: locked ? "#b97819" : "#1a73e8" }),
      chrome.action.setTitle({ title: t(locked
        ? "toolbarLocked"
        : state.restricted ? "toolbarRestricted" : "toolbarOriginal") })
    ]);
  } catch (error) {
    console.error("Failed to read WebRTC policy", error);
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setTitle({ title: t("toolbarUnavailable") });
  }
}

function refresh() {
  updateBadge().catch(console.error);
}

chrome.runtime.onInstalled.addListener(refresh);
chrome.runtime.onStartup.addListener(refresh);
chrome.privacy.network.webRTCIPHandlingPolicy.onChange.addListener(refresh);
refresh();

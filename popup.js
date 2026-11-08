import { getState, enableRestriction, restoreSetting } from "./policy.js";
import { t, localizePage } from "./i18n.js";

localizePage();

const $ = (id) => document.getElementById(id);
let busy = false;
let latestState;

function render(state) {
  latestState = state;
  $("card").setAttribute("aria-busy", String(busy));
  $("dot").className = `dot ${!state.canControl ? "locked" : state.restricted ? "active" : ""}`;
  $("status-title").textContent = t(state.restricted ? "statusRestricted" : "statusOriginal");
  $("status-description").textContent = t(!state.canControl
    ? "descriptionLocked"
    : state.owned
      ? "descriptionOwned"
      : state.restricted
        ? "descriptionRestricted"
        : "descriptionOriginal");
  $("enable").disabled = busy || !state.canControl || state.restricted || state.owned;
  $("restore").disabled = busy || !state.owned;
  $("enable").textContent = t(state.restricted ? "enabled" : "enable");
}

function showError(error) {
  $("error").textContent = error.message || t("errorGeneric");
  $("error").hidden = false;
  $("retry").hidden = false;
}

async function refresh() {
  try {
    render(await getState());
    $("error").hidden = true;
    $("retry").hidden = true;
  } catch (error) {
    $("status-title").textContent = t("statusUnavailable");
    $("status-description").textContent = t("descriptionUnavailable");
    $("enable").disabled = true;
    $("restore").disabled = true;
    showError(error);
  } finally {
    $("card").setAttribute("aria-busy", String(busy));
  }
}

async function run(operation, restored = false) {
  if (busy) return;
  busy = true;
  $("notice").textContent = "";
  $("error").hidden = true;
  $("retry").hidden = true;
  if (latestState) render(latestState);
  try {
    const state = await operation();
    $("notice").textContent = t(restored
      ? state.restricted
        ? "noticeRestoredRestricted"
        : "noticeRestored"
      : "noticeEnabled");
  } catch (error) {
    showError(error);
  } finally {
    // Read again without clearing any operation error the user needs to see.
    try {
      const state = await getState();
      busy = false;
      render(state);
    } catch (error) {
      busy = false;
      latestState = undefined;
      $("card").setAttribute("aria-busy", "false");
      $("enable").disabled = true;
      $("restore").disabled = true;
      showError(error);
    }
  }
}

$("enable").addEventListener("click", () => run(enableRestriction));
$("restore").addEventListener("click", () => run(restoreSetting, true));
$("retry").addEventListener("click", refresh);
chrome.privacy.network.webRTCIPHandlingPolicy.onChange.addListener(() => {
  if (!busy) refresh();
});
refresh();

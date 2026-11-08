import { t } from "./i18n.js";

export const RESTRICTED_POLICY = "disable_non_proxied_udp";

function setting() {
  const api = globalThis.chrome?.privacy?.network?.webRTCIPHandlingPolicy;
  if (!api) throw new Error(t("errorUnsupported"));
  return api;
}

export async function getState() {
  const details = await setting().get({ incognito: false });
  return {
    value: details.value,
    restricted: details.value === RESTRICTED_POLICY,
    owned: details.levelOfControl === "controlled_by_this_extension",
    canControl: ["controllable_by_this_extension", "controlled_by_this_extension"]
      .includes(details.levelOfControl),
    levelOfControl: details.levelOfControl
  };
}

export async function enableRestriction() {
  const before = await getState();
  if (!before.canControl) throw new Error(t("errorLocked"));
  await setting().set({ value: RESTRICTED_POLICY, scope: "regular" });
  const after = await getState();
  if (!after.restricted || !after.owned) {
    throw new Error(t("errorNotApplied"));
  }
  return after;
}

export async function restoreSetting() {
  // Clear our contribution even if another extension has since taken precedence.
  // Never force `default`, which would override the user's underlying setting.
  await setting().clear({ scope: "regular" });
  const after = await getState();
  if (after.owned) throw new Error(t("errorRestore"));
  return after;
}

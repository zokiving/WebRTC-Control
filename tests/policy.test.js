import test from "node:test";
import assert from "node:assert/strict";
import { getState, enableRestriction, restoreSetting, RESTRICTED_POLICY } from "../policy.js";
import { mockI18n } from "./helpers.js";

function mock({ base = "default", locked = false, ignored = false, fail } = {}) {
  let own;
  const calls = [];
  globalThis.chrome = { i18n: mockI18n(), privacy: { network: { webRTCIPHandlingPolicy: {
    async get(details) {
      assert.deepEqual(details, { incognito: false });
      return { value: own ?? base, levelOfControl: locked
        ? "controlled_by_other_extensions" : own
          ? "controlled_by_this_extension" : "controllable_by_this_extension" };
    },
    async set(details) {
      calls.push(["set", details]);
      if (fail) throw new Error(fail);
      if (!ignored) own = details.value;
    },
    async clear(details) {
      calls.push(["clear", details]);
      if (fail) throw new Error(fail);
      own = undefined;
    }
  } } } };
  return calls;
}

test("enables restriction and releases it back to a non-default underlying policy", async () => {
  const calls = mock({ base: "default_public_interface_only" });
  assert.equal((await getState()).restricted, false);
  assert.equal((await enableRestriction()).owned, true);
  const restored = await restoreSetting();
  assert.equal(restored.value, "default_public_interface_only");
  assert.equal(restored.owned, false);
  assert.deepEqual(calls, [
    ["set", { value: RESTRICTED_POLICY, scope: "regular" }],
    ["clear", { scope: "regular" }]
  ]);
});

test("does not claim restoration removes a restriction in the underlying settings", async () => {
  mock({ base: RESTRICTED_POLICY });
  await enableRestriction();
  const state = await restoreSetting();
  assert.equal(state.restricted, true);
  assert.equal(state.owned, false);
});

test("refuses to set a policy controlled by another extension", async () => {
  const calls = mock({ locked: true });
  await assert.rejects(enableRestriction(), /其他扩展/);
  assert.deepEqual(calls, []);
});

test("detects a successful API call whose setting did not take effect", async () => {
  mock({ ignored: true });
  await assert.rejects(enableRestriction(), /未能生效/);
});

test("can clear its contribution even when another extension has taken precedence", async () => {
  const calls = mock({ locked: true });
  const state = await restoreSetting();
  assert.equal(state.canControl, false);
  assert.deepEqual(calls, [["clear", { scope: "regular" }]]);
});

test("surfaces browser API errors", async () => {
  mock({ fail: "Permission denied" });
  await assert.rejects(enableRestriction(), /Permission denied/);
  await assert.rejects(restoreSetting(), /Permission denied/);
});

test("reports unsupported browsers", async () => {
  globalThis.chrome = { i18n: mockI18n() };
  await assert.rejects(getState(), /不支持/);
});

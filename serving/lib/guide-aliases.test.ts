import { describe, it } from "node:test";
import assert from "node:assert";
import { GUIDE_ID_ALIASES, resolveGuideId } from "./guide-aliases.ts";

describe("resolveGuideId", () => {
  it("maps the retired prompt-api ID to language-model", () => {
    assert.strictEqual(resolveGuideId("prompt-api"), "language-model");
  });

  it("returns non-alias IDs unchanged", () => {
    assert.strictEqual(resolveGuideId("language-model"), "language-model");
    assert.strictEqual(resolveGuideId("non-existent-id"), "non-existent-id");
  });

  it("ignores inherited object keys", () => {
    assert.strictEqual(resolveGuideId("constructor"), "constructor");
    assert.strictEqual(resolveGuideId("__proto__"), "__proto__");
  });

  it("never aliases to another alias", () => {
    for (const target of Object.values(GUIDE_ID_ALIASES)) {
      assert.ok(!Object.hasOwn(GUIDE_ID_ALIASES, target), `${target} is itself an alias`);
    }
  });
});

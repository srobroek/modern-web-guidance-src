
import { describe, it } from "node:test";
import assert from "node:assert";
import { getGuide } from "./practices.ts";

describe("getGuide", () => {
  it("should retrieve full guide when no section is provided", async () => {
    const guide = await getGuide("accessible-error-announcement");
    assert.ok(guide);
    assert.ok(guide.includes("Standard HTML5 validation provides visual feedback"));
  });

  it("should return null for non-existent guide", async () => {
    const guide = await getGuide("non-existent-id");
    assert.strictEqual(guide, null);
  });

  it("should retrieve category skill when category name is provided", async () => {
    const guide = await getGuide("forms");
    assert.ok(guide);
    assert.ok(guide.includes("Semantic Structure and Form Element"));
  });

  it("should resolve the retired prompt-api ID to the language-model guide", async () => {
    const guide = await getGuide("prompt-api");
    assert.ok(guide);
    assert.strictEqual(guide, await getGuide("language-model"));
  });
});

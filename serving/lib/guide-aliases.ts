/**
 * Retired guide IDs that `retrieve` still accepts, mapped to the guide that replaced them.
 * Keep an entry for as long as published skills or agent transcripts may still use the old ID.
 */
export const GUIDE_ID_ALIASES: Readonly<Record<string, string>> = {
  // Old name for the Prompt API guide. The distribution used to ship a byte-identical
  // prompt-api.md copy of language-model.md; retrieve now resolves the ID instead.
  "prompt-api": "language-model",
};

/** Returns the canonical guide ID for `id`, following at most one alias. */
export function resolveGuideId(id: string): string {
  return Object.hasOwn(GUIDE_ID_ALIASES, id) ? GUIDE_ID_ALIASES[id] : id;
}

---
name: project-content-review
description: >-
  Review content and guide Pull Requests on GoogleChrome/modern-web-guidance-src (MWG / Modern Web Guidance).
  Use this skill whenever asked to review, inspect, or give feedback on an MWG PR (by PR number or GitHub URL)
  touching guides/, features/, expectations.md, or skills-src/.
---

# Modern Web Guidance (MWG) Content PR Review

Use this workflow when reviewing content or guide Pull Requests in `GoogleChrome/modern-web-guidance-src`.

## 1. PR Discussion History & Local Environment Setup

- **Fetch PR Metadata, Commits, & All Prior/Current Review Feedback First**:
  - Always inspect existing PR comments, review summaries, inline review threads (both active and resolved/outdated), and commits before evaluating the code or drafting comments:
    ```bash
    PR_NUM=<PR_NUMBER>
    gh pr view "$PR_NUM" --json title,body,baseRefName,headRefName,headRefOid,commits,comments,reviews
    gh api "repos/GoogleChrome/modern-web-guidance-src/pulls/${PR_NUM}/comments" --paginate -q '.[] | "[\(.user.login) on \(.path):\(.line // .original_line) (in_reply_to=\(.in_reply_to_id // "root"))]:\n\(.body)\n---"'
    ```
  - **Account for existing feedback**:
    - **Never duplicate** a point that another reviewer (or bot) has already raised on the PR. If you agree with an existing open comment and have additional context, note that to the user rather than drafting a duplicate comment.
    - **Do not rehash resolved discussions**: If something was already suggested, discussed, and intentionally settled or rejected in a comment thread (or fixed in a follow-up commit), do not bring it up again unless you have genuinely new technical information or a later commit introduced a regression.
- **Main Checkout (shared, do NOT check out PR branches here)**:
  - Your primary repository clone may be used concurrently by other sessions or have in-progress local changes. Switching branches or editing files directly in the main working tree can clobber (or be clobbered by) other work.
  - Use the main checkout for read-only reference (`origin/main` docs, `.agents/skills/`) and as the git object store for fetches and worktrees.
- **Per-PR Worktree (do all review work here)**:
  - Fetch the PR head into the main checkout, then create an isolated worktree. Symlink `node_modules` (root, `guides/`, `serving/`, `lib/` when present) from the main checkout rather than reinstalling so `validateGuide`, `replaceMacros`, and Playwright run from the worktree unchanged:
    ```bash
    command -v node >/dev/null || export PATH="$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin:$PATH"
    REPO="$(git rev-parse --show-toplevel)"
    WT="${TMPDIR:-/tmp}/mwg-wt-${PR_NUM}"
    git -C "$REPO" fetch origin main
    [ "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" = "main" ] && [ -z "$(git -C "$REPO" status --porcelain)" ] && git -C "$REPO" merge --ff-only origin/main || true
    git -C "$REPO" fetch origin "pull/${PR_NUM}/head:pr-${PR_NUM}"
    git -C "$REPO" worktree add "$WT" "pr-${PR_NUM}"
    for d in . guides serving lib; do
      [ -d "$REPO/$d/node_modules" ] && [ ! -e "$WT/$d/node_modules" ] && ln -s "$REPO/$d/node_modules" "$WT/$d/node_modules" || true
    done
    ```
  - If `$WT` already exists from an earlier session, reuse it: `git -C "$WT" fetch origin "pull/${PR_NUM}/head" && git -C "$WT" reset --hard FETCH_HEAD` (after confirming `git -C "$WT" status` has nothing you still need).
  - Never `git add -A` / `git add .` in the worktree — the `node_modules` symlinks show up as untracked. Stage files explicitly.
  - **Pushing follow-up commits**: in the worktree, check out the PR's `headRefName` tracking `origin` (`git -C "$WT" checkout -B <headRefName> origin/<headRefName>`), commit, and push directly (only after explicit user approval).
  - **Cleanup** when the review is done and nothing is unpushed: `git -C "$REPO" worktree remove "$WT"` (add `--force` only if the only untracked entries are the `node_modules` symlinks). Don't leave worktrees around holding `pr-<N>` branches.
- **Node / pnpm in Non-Interactive Shells**:
  - If `node` or `pnpm` is not on the default non-interactive `PATH` and `nvm` is installed under `~/.nvm/versions/node/`, prepend `~/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -n 1)/bin` to `PATH` when running commands.
- **Running Playwright graders & ad-hoc browser probes**:
  - **Target evaluation graders (`targets/<base_app>/grader.ts`)**: When a PR adds or modifies target evaluation files (`targets/<base_app>/grader.ts`, `patches/*-solution.patch`, `patches/zero-passrate.patch`), verify calibration via:
    ```bash
    cd "$WT"
    node --experimental-strip-types ./bin/gd.ts dev guides/<category>/<slug> --test-grader
    ```
  - **Ad-hoc Playwright verification specs against `demo.html`**: `guides/playwright.config.ts` pins `testDir` to the `guides/` directory and `testMatch` to `**/grader.ts`. To run an ad-hoc Playwright probe against `demo.html` (e.g., inspecting computed layout, accessibility tree, or forcing a JS fallback branch by stubbing `CSS.supports` via `page.addInitScript`), create a temporary spec at `$WT/guides/_probe/grader.ts`, run:
    ```bash
    cd "$WT/guides"
    TARGET_FILE="$WT/guides/<category>/<slug>/demo.html" ./node_modules/.bin/playwright test -c ./playwright.config.ts --reporter=line _probe/grader.ts
    ```
    and delete `$WT/guides/_probe` (and `test-results/_probe*`) afterward.
- **Scratch scripts for `validateGuide` / `replaceMacros`**: write a temporary `.mts` file inside `$WT` (so relative imports of `./serving/lib/macros.ts` and `./lib/guide-validation.ts` resolve), run it with `node --experimental-strip-types`, then delete it.

## 2. Load MWG Docs, `AGENTS.md`, & Project-Level Skills First

Before evaluating the PR diff, **always read the repository's documentation, `AGENTS.md` files, and `.agents/skills/`** from `origin/main` (either from `$REPO` when on `main` or via `git -C "$REPO" show origin/main:<path>`). **Never** read `.agents/skills/` from `$WT` unless the PR itself modifies that skill file, as older PR branches may have stale copies:

### Repository Guides, READMEs, & `AGENTS.md`
- [README.md](../../../README.md) — Project overview, CLI commands, and workspace architecture.
- [CONTRIBUTING.md](../../../CONTRIBUTING.md) — Roles (SMEs, Content ATLs), review checkpoints, and `expectations.md` sync requirements.
- [CONTEXT.md](../../../CONTEXT.md) — End-to-end architecture and workflow context.
- [EVALS.md](../../../EVALS.md) — Evaluation pipeline and grading methodology.
- [guides/AGENTS.md](../../../guides/AGENTS.md) and [guides/README.md](../../../guides/README.md) — Two-checkpoint guide authoring workflow, `gd dev` / `gd pr` lifecycle, and `DISCIPLINE_GUIDES` registration requirement.
- [serving/AGENTS.md](../../../serving/AGENTS.md) and [skills-src/README.md](../../../skills-src/README.md) — Read when skills packaging, macros, or serving logic are relevant.

### Project-Level Skills (`.agents/skills/`)
- [project-use-cases/SKILL.md](../project-use-cases/SKILL.md) — Stage 1: Use-case vs. discipline guide rules, action-oriented `description` phrasing ("WHAT not HOW"), category taxonomy, and minimizing overlap.
- [project-guides/SKILL.md](../project-guides/SKILL.md) — Stage 2: Frontmatter schema, tone, build-time macros (`INCLUDE`, `GUIDE_REF`, `BASELINE_STATUS`, `FEATURE_FALLBACKS`), fallback strategies, and `expectations.md`.
- [project-guide-validation/SKILL.md](../project-guide-validation/SKILL.md) — Canonical `accessibility` guide compliance, expectation alignment, and copy-paste safety.
- [project-evals/SKILL.md](../project-evals/SKILL.md) — Stage 3: Read when `expectations.md`, `demo.html`, `grader.ts`, or `task.md` are modified.
- [web-baseline/SKILL.md](../web-baseline/SKILL.md) — Querying valid `web-features` IDs and Baseline support status via `pnpm baselinestatus <query>`.
- [project-coding-standards/SKILL.md](../project-coding-standards/SKILL.md) — Read when TypeScript/CLI/harness/dashboard code is also touched.

## 3. Fetch Full Before/After Files & Run Validation

1. **Compare full `BASE` and `HEAD` files**:
   - Do not rely solely on diff hunks. For any modified, split, or reorganized guide, inspect the full file at the PR's base commit (`git show <base_sha>:<path>`) alongside the head version.
2. **Run guide validation**:
   - Run `validateGuide()` from [`lib/guide-validation.ts`](../../../lib/guide-validation.ts) on all touched guides (or run `pnpm --filter guides test`).
   - **How `web-feature-ids` validity is checked**: `validateGuide()` calls `validateFeature(id)` in [`serving/lib/baseline.ts`](../../../serving/lib/baseline.ts), which verifies that every entry in `web-feature-ids` is either:
     1. A primary feature ID (`kind === 'feature'`, not a `'moved'` or `'split'` redirect record) in the `web-features` npm package (search IDs with `pnpm baselinestatus <query>`; see [web-baseline/SKILL.md](../web-baseline/SKILL.md)), or
     2. A temporary `tmp-<candidate-slug>` ID registered in [`features/pending-web-features.json`](../../../features/pending-web-features.json) with an upstream `web-platform-dx/web-features` issue link (see [project-guides/SKILL.md](../project-guides/SKILL.md)).
   - *Note on unrecognized frontmatter keys*: Unrecognized YAML frontmatter keys (e.g., `todo-web-feature-ids`) are ignored by `gray-matter` and `guide-validation.ts` and may be used intentionally by authors as reminders—do not flag them as errors as long as `web-feature-ids` itself passes validation.
3. **Render build-time macros**:
   - Run `replaceMacros(body, filePath, { target: 'skills-cli' })` from `serving/lib/macros.ts` on touched guides to inspect the exact markdown coding agents receive:
     - Confirm `{{ INCLUDE("path#section") }}` resolves to non-empty content (`resolveInclude` returns `""` silently on missing files or sections).
     - Check that explicit `{ #section-id }` heading suffixes aren't left on headings when `slugify(heading)` already matches `#section-id`, since `{ #section-id }` is not stripped from the rendered heading in the source guide.
     - **Scrutinize `{{ GUIDE_REF("slug") }}` usage**: Agents mostly discover and batch-retrieve guides upfront (`retrieve "a,b"`) from `search` or `list` results and follow `GUIDE_REF`s <0.5% of the time. Never rely on `GUIDE_REF` for requirements of the current guide (core rules, shared prerequisites, accessibility requirements, or fallbacks must be inlined in `guide.md` or transcluded at build time via `INCLUDE` / `FEATURE_*`). Use `GUIDE_REF` only to point to a separate use case that is out of scope for the current guide:
       - **Disambiguating closely related sibling guides MUST be placed at the top**: Disambiguation notes (e.g., `hovercard` vs. `interest-triggered-tooltips`, `progress-ring` vs. `spinner`) must be placed in the introductory overview *before* Section 1 and before any code snippets. Coding agents anchor heavily on the first code block they see; placing disambiguation mid-guide causes agents to commit to the wrong pattern before discovering the exit ramp. An upfront fork lets agents pivot immediately (`retrieve "sibling"`) without wasting context.
       - **Router / orientation hubs**: High-level hubs routing to specialized sub-guides (e.g., `passkeys`, `web-components`).
       - **Referencing an adjacent use case**: Companion guides for optional sub-problems (e.g., `forms` pointing to `ime-safe-enter-submit`).

## 4. Content & Architecture Review Checklist

### Agent Token Economy & Technical Substance
- **Teach only the course-correction delta**: Cut reference-style syntax enumeration and textbook explanations of Baseline Widely Available features (e.g., how `<label>` or `addEventListener` works, or default attribute values like `min="0" max="100" step="1"`). If unsure what agents get wrong, test a greenfield prompt on a fast/cheap model without the guide and keep only what it misses.
- **No full-implementation code dumps**: Every code snippet must illustrate something the agent cannot infer from the prose above. Replace 50+ line boilerplate blocks with a bulleted algorithm crux and minimal, targeted snippets; strip orthogonal details (e.g., inline SVG icons, arbitrary visual design opinions).
- **Maintainer rationale vs. agent rationale (`{# ... #}` comments vs. `guide.md` prose/comments)**:
  - A separate `reasoning.md` / `notes.md` file (or repeated paragraphs inside `guide.md` justifying why a third-party polyfill was rejected or citing browser bug numbers) is a smell that `guide.md` is either not self-explanatory enough or is mixing human maintainer notes with agent instructions.
  - Recommend addressing it in one of two ways (and removing separate `reasoning.md` files):
    1. **Internal notes for human maintainers**: Use `{# ... #}` comments inside `guide.md` (which [`stripComments()`](../../../serving/lib/macro-parsing.ts) strips out of the built guide served to agents) for upstream bug links, review history, or why an alternative/polyfill was rejected.
    2. **Actionable rationale for coding agents**: Put concise "why" explanations directly in `guide.md` prose or inline code comments (e.g., `// Stop propagation so Escape in a nested submenu doesn't bubble up and close the parent menu`) whenever an agent might otherwise doubt or misapply a non-obvious pattern.
- **Decision frameworks over blanket mandates**: Present competing approaches (e.g., `accent-color` vs. `appearance: none`, `@container style()` vs. descendant selectors, or fallback tiers) as explicit alternatives with *when-to-use* criteria, not sequential steps. Don't just say *"don't do X"* for common requests—explain the caveats and show the least-broken pattern. Question whether `MANDATORY` rules are truly universal (e.g., dampening vs. killing animations in `prefers-reduced-motion: reduce` so spinners/progress still look alive).
- **Platform-native composition & CSS/JS rigor**:
  - Flag manual re-implementations of native top-layer/disclosure behavior (light dismiss, `Escape`, focus restore, `z-index` stacking) when `<dialog>`, `[popover]`, or `<details>` works natively.
  - Declare vendor-prefixed pseudo-element selectors (`::-webkit-*`, `::-moz-*`) **once** and drive state variations (`:indeterminate`, reduced motion, colors) via custom properties (`--_prop: var(--prop, default)`). Place vendor-prefixed properties *before* unprefixed ones.
  - Check CSS parsing/inheritance traps: declarations becoming *invalid at computed-value time* when `var()` resolves to an unsupported syntax token (which discards earlier fallback declarations in the same rule and resets the property to `unset`); never registering `light-dark()` design tokens with `@property` `syntax: "<color>"` (locks at `:root`) while re-declaring built-in inherited `<color>` properties (`color`, `accent-color`) on local `color-scheme` subtrees; clamping chroma `c` when shifting `oklch()` lightness near `0` or `1`; wrapping experimental selectors in `:is()`.
  - Verify spec validity of all CSS/HTML tokens, Shadow DOM safety (`e.composedPath()[0]`), container-scoped listeners (multi-instance safe), and RTL/logical properties.
- **Fallback realism & strict separation**:
  - Keep `@supports` blocks, vendor prefixes, JS polyfill workarounds, and browser support caveats out of the core Implementation section (and drop biasing words like `"experimental"`). However, when a use case inherently combines complementary HTML/JS layers (e.g., WebOTP + `autocomplete="one-time-code"` + `inputmode="numeric"`), summarizing how those layers work together in the intro is good mental-model framing—do not flag it as "leaking fallbacks into implementation."
  - **Never propose adding cross-browser fallbacks outside `## Fallback strategies`**: Per [project-guides/SKILL.md](../project-guides/SKILL.md), cross-browser feature detection and fallbacks belong exclusively in `## Fallback strategies`. Do **not** flag `## Implementation` or `## Example` snippets for omitting feature-detection guards (e.g., `if (!('startViewTransition' in Element.prototype))`), and never propose `suggestion` blocks that inject fallback branches into `## Implementation` or `## Example`.
  - **`BASELINE_STATUS` on Baseline Widely Available features is allowed (do NOT ask authors to remove it)**: Per [project-guides/SKILL.md](../project-guides/SKILL.md) (`#1696`), fallback strategies are not required for Baseline Widely Available features, and authors **should** include `{{ BASELINE_STATUS("feature-id") }}` for features that became Widely Available within the last 12 months (such as `subgrid` or `:has()`) or that coding agents commonly misjudge as lacking support. This rule is permissive, not a deletion mandate: if an author includes `{{ BASELINE_STATUS("feature-id") }}` in `## Fallback strategies` for a Baseline Widely Available feature listed in `web-feature-ids`, leave it alone rather than nitpicking to remove it.
  - Apply the **Scale × Depth** test (*"Would I be happy if my agent shipped this?"*): for Limited Availability features where most users lack support (e.g., `switch`, `customizable-select`, `interestfor`), progressive enhancement alone is rarely acceptable—require a high-fidelity fallback/polyfill or an explicit *"do not use when…"* rule.
- **No hard-coded browser support claims or manual availability prose**:
  - Flag any prose in `guide.md` that hard-codes browser support claims, version numbers, support matrices, or availability timelines (e.g., *"When X is supported..."*, *"until X is supported across major browsers"*, *"X is only supported in Chromium"*, *"X is not yet supported in Firefox"*). Browser support is dynamic and manual claims quickly go stale.
  - Browser support and availability must always be rendered dynamically via build-time macros: `{{ BASELINE_STATUS("feature-id"[, "bcd.key"]) }}` or `{{ FEATURE_FALLBACKS("feature-id") }}` (or `{{ FEATURE("feature-id", "fallbacks") }}`).
  - When discussing emerging, newly available, or limited-availability features in `## Progressive enhancement and fallbacks` (such as `progress()`, `attr()`, or `control-value()`), require authors to anchor them to a valid `web-feature-id` (or a `tmp-<candidate-slug>` registered in `features/pending-web-features.json`) and render their status with macros rather than speculative hand-waving in prose.
  - **Exception — OS/UA integration context not captured by BCD**: Do not flag brief, factual notes explaining *how* a platform or OS integrates with a standard HTML token or format when BCD/`BASELINE_STATUS` does not capture that mechanism (for example, noting that iOS/iPadOS/macOS Safari uses the `@domain #code` SMS format to populate `autocomplete="one-time-code"` in the system keyboard autofill bar).
- **Interactive demo edge-case probing**: Verify `demo.html` actually depends on the target feature and exercises non-trivial cases (e.g., uneven grids, multiple instances). Probe slow scrolling near sticky/scroll-state thresholds, all arrow keys, right-click (`e.button === 0`), and Safari/Firefox rendering quirks.

### Content Preservation (Splits, Merges, & Reorgs)
- Do a **bullet-by-bullet and code-block-by-code-block audit** between `BASE` and `HEAD`.
- Flag any silently dropped bullets or code examples and verify whether each drop is already covered inline/transcluded or was dropped accidentally.
- When merging content from multiple guides (e.g., CSS + Accessibility), check for **adjacent duplicate bullets** or **inconsistent bullet formatting** (e.g., mixing `**Bold lead**:` bullets with plain bullets) and suggest consolidating them.

### Repo-Wide Coherence & Metadata
- **DRY via `features/<feature-id>.md` & transclusion macros**: When feature-level content (browser support nuances, BCD sub-key statuses, feature-detection probes, fallback patterns, gotchas, or accessibility caveats) applies to more than one guide, flag duplicated prose/code across guides and recommend extracting it into `features/<feature-id>.md` (`## Fallbacks`, `## Issues`, `## Usage`, or custom `{#section-id}` sections) and transcluding via `{{ FEATURE_FALLBACKS("<feature-id>") }}`, `{{ FEATURE_ISSUES("<feature-id>") }}`, `{{ FEATURE("<feature-id>", "<section>") }}`, or `{{ INCLUDE("...") }}`. Note that `FEATURE` / `INCLUDE` expand nested macros recursively (such as `{{ BASELINE_STATUS("feature-id", "bcd.key") }}`).
- **Deterministic, non-overconstraining evals (`expectations.md`, `grader.ts`, `task.md`)**:
  - Keep `expectations.md` in sync with `guide.md` and strip redundant `MANDATORY:` / `OPTIONAL:` / `DO` / `DO NOT` prefixes. Note that `gd dev` (`guides/dev-guide.ts` + `guides/grader-gen.ts`) no longer calibrates against `demo.html` or `negative-demo.html`: it generates and calibrates `targets/<base_app>/grader.ts` against `patches/*-solution.patch` and `patches/zero-passrate.patch` (and grades the eval agent's output from `targets/<base_app>/task.md`), and `parseExpectations()` / `validateGraderExpectationCoverage()` treat every top-level bullet in `expectations.md` as a required must-pass test regardless of `OPTIONAL` prefixes.
  - Ask *"How can a deterministic Playwright script know this?"*—rewrite assertions that require human judgment (e.g., *"decorative SVGs"* or *"non-submit buttons"*) into concrete structural/behavioral checks (e.g., *"every `<button>` inside a `<form>` sets a `type` attribute"*).
  - Never upgrade guide *"Prefer"* / *"Optional"* / conditional rules into unconditional `MUST` assertions, don't split *"A or B"* bullets into `AND`-ed tests, and don't assert arbitrary snippet example values (`0.4s`, `ease-in-out`). Keep required test DOM locators in `targets/*/task.md`, never in `guide.md` `description`.
- **`DISCIPLINE_GUIDES` in `lib/guide-validation.ts`**: Per [guides/AGENTS.md](../../../guides/AGENTS.md), any new named discipline/orientation guide MUST have its slug added to `DISCIPLINE_GUIDES` in `lib/guide-validation.ts`.
- **Stale cross-references & overlap**: Search across `guides/` and `features/` for `GUIDE_REF` or `INCLUDE` calls pointing to sections that moved, and check sibling guides (e.g., `css-layout` vs. `responsive-design`) for unlinked overlap.
- **Frontmatter & RAG discoverability (`name`, `description`, `web-feature-ids`, `##` headings)**:
  - Because agents discover guides via `search` rather than hub `GUIDE_REF`s, verify `description`, `# H1`, and `##` headings (which RAG chunks on) carry high information scent and match the guide's actual scope.
  - For use-case guides (non-discipline guides), `description` must start with a verb and describe *what* the user wants to do rather than *how* (never naming specific APIs/properties).
- **Markdown & TOC hygiene**:
  - Verify TOC numbering and `#anchor` links match the headings in the body, and ensure TOCs don't include the document's own `# H1` as a top-level bullet.
  - Check for skipped heading levels (e.g., `# H1` jumping directly to `### H3` without `## H2`).
- **American English standard**: Per [project-guides/SKILL.md](../project-guides/SKILL.md), all guidance prose and code comments MUST use American English (`behavior`, `color`, `synchronize`, `center`, `optimize`, etc.). Flag Commonwealth/British spellings (`-ise`, `-our`, `-re`, `synchronise`, `behaviour`, `colour`) and provide clean suggestion blocks to convert them.

## 5. Mandatory Adversarial Self-Review of Drafted Comments & Suggestions (No "Slop Grenades")

Before staging a `PENDING` review or presenting findings to the user, **always run an adversarial audit** (via a dedicated subagent when available, or systematic empirical verification) on every drafted comment and ```` ```suggestion ```` block to guarantee zero "slop grenades" (misinformed claims, spec misreadings, or broken suggestions):

1. **Empirically execute every CSS/JS/HTML ```` ```suggestion ```` block in headless Chromium**:
   - Apply your exact proposed `suggestion` blocks to a scratch copy of `demo.html` / `guide.md` and inspect the result in Playwright/Chromium (both default and with `--enable-experimental-web-platform-features` when relevant):
     - Check `getBoundingClientRect()` coordinates at desktop (`1024x768`) and mobile (`375x667`) viewports (e.g., verify `position-area` span directions: `span-block-end` spans `center` + `block-end` to grow downward from the trigger's top edge, whereas `span-block-start` grows upward from the trigger's bottom edge).
     - Inspect the accessibility tree (`ariaSnapshot()` / computed roles) and keyboard navigation (`Arrow*`, `Home`, `End`, `Escape`, `Tab`).
     - Run `validateGuide()` and `replaceMacros()` on `guide.md` with your suggested edits applied.
2. **Verify every specification, IDL, and macro claim against primary sources**:
   - Check actual specifications/explainers (e.g., Open UI, CSSWG, WHATWG HTML, ARIA in HTML) for exact IDL property casing (`focusGroup` vs `focusgroup`), precedence rules (e.g., explicit container `role` skipping `focusgroup` child role inference), and feature-detection patterns.
   - Check what `{{ FEATURE_FALLBACKS("<id>") }}` actually outputs via `serving/lib/macros.ts` (`features/<id>.md` vs. one-line status string) before asking the author to add or remove fallback prose.
   - Verify that any CSS property or code construct referenced in your comment on `guide.md` (e.g., `inset: auto` vs `margin: 0`) actually appears in `guide.md` rather than only in `demo.html`.
   - Verify that no browser support claims in the PR diff or your drafted comments/suggestions are hard-coded in prose; confirm that any discussed feature is tied to a valid `web-feature-id` (or `tmp-*` pending entry) and rendered via `BASELINE_STATUS` or `FEATURE_FALLBACKS`.
3. **Cross-check against prior PR review threads and linked issues**:
   - Verify that none of your suggestions contradict a change the author specifically made in response to an earlier reviewer's feedback (or if a nuance was missed in that earlier exchange, acknowledge the prior point explicitly and show how to satisfy both constraints).
   - Check the originating use-case issue (e.g., `web-feature-ids` in the Stage 1 stub and `guides/sync-use-cases.ts`) before telling an author to remove a `web-feature-id`.

## 6. Presenting Feedback & Posting PR Reviews

1. **Stage a `PENDING` GitHub PR review first, then summarize in chat**:
   - Check if a `PENDING` review by the user already exists on the PR (`gh api "repos/GoogleChrome/modern-web-guidance-src/pulls/${PR_NUM}/reviews" -q '.[] | select(.state == "PENDING")'`). If none exists, create a **`PENDING` review** (by omitting `"event"` in `POST repos/GoogleChrome/modern-web-guidance-src/pulls/<PR>/reviews`) containing the brief top-level summary and all adversarially verified inline comments (with ```` ```suggestion ```` blocks).
   - **Keep the top-level review comment brief (1–3 sentences)**: The top-level review body (`body`) MUST be 1–3 sentences capturing the overall themes of the review. Never list or repeat the individual findings covered in the inline comments.
   - **Keep the chat response concise (but ALWAYS show the drafted top-level comment)**:
     - *GitHub UI quirk*: Although the GitHub API saves `body` on a `PENDING` review, GitHub's web UI does **not** pre-populate the **"Finish your review"** textarea with the saved `body` (and clicking "Submit review" in the web UI with an empty textarea overwrites `body` with `""`).
     - Therefore, in your chat response, always include:
       1. The **exact drafted top-level comment inside a copyable ```` ```markdown ```` fenced code block** (never a blockquote, so the user can one-click copy the raw Markdown source with `[path](https://...)` links preserved and paste it directly into GitHub's "Finish your review" textarea).
       2. A concise summary of the inline comments (plus brief **Prior discussion / already covered** and **Things verified as fine** notes) — do **not** dump all full inline comment bodies into chat.
       3. A direct link to the PR (`https://github.com/GoogleChrome/modern-web-guidance-src/pull/<PR>/files`) so the user can view the exact staged inline comments on GitHub.
   - **Iterate on the `PENDING` draft in conversation**: If the user asks for changes in chat, update the staged `PENDING` review on GitHub (note: REST `PATCH /pulls/comments/<id>` returns `404` on `PENDING` review comments, so either use `DELETE repos/.../pulls/<PR>/reviews/<review_id>` + `POST repos/.../pulls/<PR>/reviews` to re-stage cleanly, or GraphQL `updatePullRequestReviewComment`) and confirm the update.
   - **ALWAYS wait for explicit confirmation before submitting**: Never submit the review (`POST repos/GoogleChrome/modern-web-guidance-src/pulls/<PR>/reviews/<review_id>/events` with `event: "COMMENT" | "REQUEST_CHANGES" | "APPROVE"` and `body`) until the user explicitly confirms in the conversation.
   - Filter out anything already raised by another reviewer or settled in prior PR threads unless you have new evidence to add.
2. **Formatting & submitting GitHub PR comments**:
   - **Mandatory `🤖` prefix**: Prefix the top-level review body and every individual inline comment with `🤖 `.
   - **Do not include severity labels in GitHub comments**: Never prefix inline comments with internal triage labels like `**[BLOCKER]**`, `**[SHOULD-FIX]**`, or `**[NIT]**`. Start each inline comment directly with `🤖 ` followed by the feedback (severity is only used to choose the overall review disposition and in the chat summary table).
   - **Link repository files instead of code-formatting paths**: When referencing repository files or directories in review comments (e.g., `guides/sync-use-cases.ts` or `.agents/skills/project-guides/SKILL.md`), format them as clickable GitHub links (e.g., `[guides/sync-use-cases.ts](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/sync-use-cases.ts)`) rather than inline code (`` `guides/sync-use-cases.ts` ``). Use `/blob/main/<path>` (with `#L<start>-L<end>` when citing specific lines) for files and `/tree/main/<path>` for directories.
   - **Don't wrap `@username` mentions in backticks (and avoid accidental `#N` issue links)**: Write GitHub handles as plain `@username` (e.g., `@knowler`, `@LeaVerou`) rather than `` `@username` `` so GitHub links the mention and notifies the person, unless the user explicitly asks not to ping/notify them. Conversely, never write `test #8` or `step #2` for ordinal numbers—GitHub auto-links `#N` to issue/PR `N`.
   - **Formatting inline code that contains backticks (e.g., JS template literals)**:
     - In Markdown (CommonMark/GFM), backslashes (`\`) do **not** escape backticks inside single-backtick code spans (writing `` `foo(\`bar\`)` `` or `` `foo(`bar`)` `` breaks the code span at the inner backtick and renders literal backslashes).
     - Whenever an inline code span contains backticks (such as a JS template literal), wrap the outer code span in **double backticks** with no backslash escaping inside: e.g., `` ``console.log(`Tokyo time: ${tokyoTime}`)`` `` or `` `` `${date}T${time}` `` `` (include a single leading and trailing space inside the double backticks if the content starts or ends with a backtick).
     - When generating `review.json` via a script, construct strings using Python (`python3` with `json.dumps`) or double-quoted JS strings rather than nested JS template literals or bash-interpolated strings so that `` ` `` and `${...}` are never mangled or double-escaped by the shell/runtime.
   - **Include narrow, surgical `suggestion` blocks**: Whenever a comment proposes a concrete line edit inside a diff hunk, include a `suggestion` block verified against exact `HEAD` line numbers (`start_line` / `line`, `side: "RIGHT"`) for one-click application.
     - **Make the line range as narrow as possible**: Never delete lines just to re-add them verbatim (e.g., if only line 10 needs editing, anchor on line 10 rather than `start_line: 1, line: 10`).
     - **Balance range width against comment count**: If two nearby lines (e.g., lines 3 and 5) need related edits, combine them into one `suggestion` block spanning lines 3–5 rather than posting separate comments, while trimming any unchanged leading or trailing lines outside that span.
     - **4 backticks for inner code fences**: If a suggestion block contains an inner 3-backtick code block (e.g., ```` ```css ````), open and close the suggestion block with **4 backticks** (````` ````suggestion ... ```` `````) so GitHub doesn't prematurely terminate the suggestion block on the inner fence. Whenever possible, keep suggestions strictly within or outside fences to avoid crossing fence boundaries.
     - **Show a fenced code block whenever a `suggestion` block is not possible**: When a proposed code change targets lines outside the PR's diff hunk (so a GitHub ```` ```suggestion ```` block cannot be anchored on those lines without overwriting the wrong lines), always include a syntax-highlighted fenced code block (e.g., ```` ```css ````, ```` ```js ````, ```` ```html ````) showing the exact proposed code rather than describing the change in prose alone.
   - **Explain general rules once and apply throughout (suggestions without comment text)**:
     - When a mechanical, styling, or repetitive rule applies across multiple places in a PR diff (e.g., stripping external links from `guide.md`, fixing repeated typos or British spellings, converting alert syntax to bold leads, or adjusting deprecated API patterns):
       - Explain the rule, rationale, and skill reference thoroughly **once** in the first relevant inline comment (or in the top-level review comment).
       - For all subsequent occurrences across the diff, provide direct, self-contained ```` ```suggestion ```` blocks **without repeating commentary text** (a comment body containing just `🤖\n\n```suggestion\n...\n````).
       - Avoid dumping long lists of separate line numbers into a single comment's text (e.g., *"here and on lines 59, 63, 88..."*) while leaving those lines without inline suggestions. Provide actionable, one-click suggestions directly on the affected lines instead.
   - **Staging & submitting commands**:
     ```bash
     # 1. Stage PENDING review (omit "event" in review.json):
     gh api repos/GoogleChrome/modern-web-guidance-src/pulls/<PR>/reviews --method POST --input review.json

     # 2. Submit the PENDING review ONLY after explicit user confirmation (include body explicitly):
     gh api repos/GoogleChrome/modern-web-guidance-src/pulls/<PR>/reviews/<REVIEW_ID>/events --method POST -f event=COMMENT -f body="..."
     ```

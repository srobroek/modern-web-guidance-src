/**
 * Eval gap fix. Backs `gd dev-gap`.
 *
 * Works through open `missing-evals` issues filed by `eval-gap-watch.ts` and
 * open `gd pr` PRs labeled `needs-eval-gen` or `needs-eval-run`.
 *
 * Usage: gd dev-gap [--dry-run] [--limit <n>] [--targets <apps>]
 */

import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { cBold, cCyan, cDim, cGreen, cRed } from '../lib/colors.ts';
import {
  scanAllGuides,
  getGuideStatus,
  ProjectStatus,
  REPORT_FILE,
  TARGETS_DIR,
  TEST_APP_RESULTS_DIR,
  SUPPORTED_BASE_APPS,
  type GuideInventory,
} from '../lib/guide-validation.ts';
import { rootDir } from '../lib/paths.ts';
import type { SuiteConfig } from '../harness/config.ts';
import { githubApi, parseMarker, type ExistingIssue } from './eval-gap-watch.ts';
import { devPrBranch, devPrTitle, runDevPr, type DevPrRerunLabel } from './lib/dev-pr.ts';

export interface OpenPr {
  number: number;
  title: string;
  headRefName?: string;
  labels?: { name: string }[];
}

export interface GapToFix {
  issueNumber?: number;
  prNumber?: number;
  branch?: string;
  rerunMode?: DevPrRerunLabel;
  guidePath: string;
  inv: GuideInventory;
}

interface SkippedGap {
  issueNumber: number;
  guidePath: string | null;
  reason: string;
}

export interface FixEvalGapsOptions {
  dryRun?: boolean;
  limit?: number;
  verbose?: boolean;
  suiteConfig?: SuiteConfig;
  targets?: readonly string[];
}

function getRerunMode(pr: OpenPr): DevPrRerunLabel | undefined {
  const names = new Set((pr.labels ?? []).map(l => l.name));
  if (names.has('needs-eval-gen')) return 'needs-eval-gen';
  if (names.has('needs-eval-run')) return 'needs-eval-run';
  return undefined;
}

function matchesGuidePr(pr: OpenPr, guideName: string): boolean {
  return pr.title === devPrTitle(guideName) || pr.headRefName === devPrBranch(guideName);
}

/** Decides which open eval-gap issues and labeled PRs to work on, and why the rest are skipped. */
export function planFixes(
  issues: ExistingIssue[],
  openPrs: OpenPr[],
  guides: GuideInventory[],
  existingBranches: Set<string>
): { toFix: GapToFix[]; skipped: SkippedGap[] } {
  const guidesByPath = new Map(guides.map(inv => [path.relative(rootDir, inv.dir), inv]));
  const toFix: GapToFix[] = [];
  const skipped: SkippedGap[] = [];
  const handledPrs = new Set<number>();

  for (const issue of issues) {
    const marker = parseMarker(issue.body);
    const skip = (reason: string) => skipped.push({ issueNumber: issue.number, guidePath: marker?.guidePath ?? null, reason });

    if (!marker) { skip('not filed by eval-gap-watch'); continue; }
    if (marker.kind !== 'missing-evals') { skip(`${marker.kind} issues are not handled`); continue; }

    const inv = guidesByPath.get(marker.guidePath);
    if (!inv) { skip('guide not found'); continue; }

    const pr = openPrs.find(p => matchesGuidePr(p, inv.name));
    if (pr) {
      handledPrs.add(pr.number);
      const rerunMode = getRerunMode(pr);
      if (rerunMode) {
        toFix.push({
          issueNumber: issue.number,
          prNumber: pr.number,
          branch: pr.headRefName || devPrBranch(inv.name),
          rerunMode,
          guidePath: marker.guidePath,
          inv,
        });
      } else {
        skip(`already has PR #${pr.number}`);
      }
      continue;
    }

    if (getGuideStatus(inv) !== ProjectStatus.NeedsEvals) { skip('guide no longer needs evals'); continue; }

    // A leftover branch (e.g. from a PR closed without merging) would make the
    // push fail after a full `gd dev` run, so skip until someone deletes it.
    const branch = devPrBranch(inv.name);
    if (existingBranches.has(branch)) { skip(`branch ${branch} already exists (delete it to retry)`); continue; }

    toFix.push({ issueNumber: issue.number, guidePath: marker.guidePath, inv });
  }

  // Also check open PRs with rerun labels that were not already matched above.
  for (const pr of openPrs) {
    if (handledPrs.has(pr.number)) continue;
    const rerunMode = getRerunMode(pr);
    if (!rerunMode) continue;

    const inv = guides.find(g => matchesGuidePr(pr, g.name));
    if (!inv) continue;

    toFix.push({
      prNumber: pr.number,
      branch: pr.headRefName || devPrBranch(inv.name),
      rerunMode,
      guidePath: path.relative(rootDir, inv.dir),
      inv,
    });
  }

  return { toFix, skipped };
}

function git(args: string[]): string {
  return child_process.execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Side effects, grouped so tests can stub them. */
export const evalGapFixCli = {
  currentBranch: () => git(['branch', '--show-current']),
  /** Empty when the working tree is clean. */
  treeStatus: () => git(['status', '--porcelain']),
  pullMain: () => { git(['pull', '--ff-only']); },
  createBranch: (branch: string) => { git(['checkout', '-b', branch]); },
  /** Fetches latest `main` and the remote PR branch, checks out the PR branch, and merges `origin/main`. */
  checkoutPrBranch: (branch: string) => {
    git(['fetch', 'origin', 'main', branch]);
    git(['checkout', '-B', branch, `origin/${branch}`]);
    git(['merge', 'origin/main', '--no-edit']);
  },
  /** Switches to `main`, dropping tracked edits/in-progress merges and untracked (non-ignored) files in `dir`. */
  resetToMain: (dir: string) => {
    git(['reset', '--hard']);
    git(['checkout', '-f', 'main']);
    git(['clean', '-fd', '--', dir]);
  },
  deleteLocalBranch: (branch: string) => { git(['branch', '-D', branch]); },
  /** `gd-dev/*` branch names that exist locally or on origin. */
  listDevBranches: (): Set<string> => {
    const local = git(['for-each-ref', '--format=%(refname:lstrip=2)', 'refs/heads/gd-dev/']).split('\n');
    const remote = git(['ls-remote', '--heads', 'origin', 'refs/heads/gd-dev/*']).split('\n')
      .map(line => line.split('\trefs/heads/')[1]);
    return new Set([...local, ...remote].filter(Boolean));
  },
  listOpenPrs: (): OpenPr[] => JSON.parse(child_process.execFileSync(
    'gh',
    ['pr', 'list', '--state', 'open', '--limit', '500', '--json', 'number,title,headRefName,labels'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  )),
  listGapIssues: (): ExistingIssue[] => githubApi.listIssues(),
  scanGuides: (): GuideInventory[] => scanAllGuides(),
  runDevGuide: async (inv: GuideInventory, options: FixEvalGapsOptions): Promise<boolean> => {
    const { devGuide } = await import('./dev-guide.ts');
    return devGuide(inv.dir, { test: true, verbose: options.verbose, suiteConfig: options.suiteConfig, targets: options.targets });
  },
  runDevPr,
};

interface Outcome {
  gap: GapToFix;
  status: 'pr-opened' | 'pr-updated' | 'dev-failed' | 'pr-failed' | 'error';
  detail: string;
}

function formatGapRef(gap: GapToFix): string {
  if (gap.prNumber && gap.issueNumber) return `PR #${gap.prNumber} (#${gap.issueNumber})`;
  if (gap.prNumber) return `PR #${gap.prNumber}`;
  return `#${gap.issueNumber}`;
}

/**
 * Runs `gd dev` then `gd pr` for one guide, then returns to a clean `main`,
 * dropping whatever didn't make it into a PR. Never throws; cleanup failures
 * are noted on the outcome and the caller checks the tree.
 */
async function fixOne(gap: GapToFix, options: FixEvalGapsOptions): Promise<Outcome> {
  const { inv } = gap;
  const branch = gap.branch || devPrBranch(inv.name);
  let createdBranch = false;

  let outcome: Outcome;
  try {
    if (gap.rerunMode) {
      createdBranch = true;
      evalGapFixCli.checkoutPrBranch(branch);

      if (gap.rerunMode === 'needs-eval-gen') {
        const targets = options.targets ?? SUPPORTED_BASE_APPS;
        for (const t of targets) {
          fs.rmSync(path.join(inv.dir, TARGETS_DIR, t), { recursive: true, force: true });
        }
      }
    }

    // test-app-results/ is gitignored and survives between runs. Clear it so the
    // report can only come from this run.
    const resultsDir = path.join(inv.dir, TEST_APP_RESULTS_DIR);
    fs.rmSync(resultsDir, { recursive: true, force: true });

    const devOk = await evalGapFixCli.runDevGuide(inv, options);
    if (!devOk || !fs.existsSync(path.join(resultsDir, REPORT_FILE))) {
      outcome = { gap, status: 'dev-failed', detail: devOk ? `gd dev wrote no ${REPORT_FILE}` : 'gd dev failed' };
    } else {
      if (!gap.rerunMode) {
        // Branch off main here so `gd pr` commits to a fresh branch this run owns.
        evalGapFixCli.createBranch(branch);
        createdBranch = true;
      }
      const prUrl = await evalGapFixCli.runDevPr(inv.dir);
      outcome = prUrl
        ? { gap, status: gap.rerunMode ? 'pr-updated' : 'pr-opened', detail: prUrl }
        : { gap, status: 'pr-failed', detail: 'gd pr failed (branch may be on origin; delete it to retry)' };
    }
  } catch (err) {
    outcome = { gap, status: 'error', detail: (err as Error).message };
  }

  try {
    evalGapFixCli.resetToMain(inv.dir);
    if (createdBranch) evalGapFixCli.deleteLocalBranch(branch);
  } catch (err) {
    outcome.detail += ` (cleanup failed: ${(err as Error).message})`;
  }
  return outcome;
}

export async function fixEvalGaps(options: FixEvalGapsOptions = {}): Promise<boolean> {
  if (!options.dryRun) {
    if (evalGapFixCli.currentBranch() !== 'main' || evalGapFixCli.treeStatus() !== '') {
      console.error(cRed('❌ Run this from a clean `main` branch.'));
      return false;
    }
    try {
      evalGapFixCli.pullMain();
    } catch (err) {
      console.error(cRed(`❌ Could not update main: ${(err as Error).message}`));
      return false;
    }
  }

  const { toFix, skipped } = planFixes(
    evalGapFixCli.listGapIssues(),
    evalGapFixCli.listOpenPrs(),
    evalGapFixCli.scanGuides(),
    evalGapFixCli.listDevBranches()
  );
  const queue = toFix.slice(0, options.limit);

  console.log(cBold(`\nEval-gap issues & PRs: ${toFix.length} to fix, ${skipped.length} skipped\n`));
  for (const s of skipped) console.log(cDim(`  skip #${s.issueNumber}${s.guidePath ? ` ${s.guidePath}` : ''} — ${s.reason}`));
  for (const g of queue) {
    const modeTag = g.rerunMode ? ` (${g.rerunMode})` : '';
    console.log(`  ${cCyan('fix')}  ${formatGapRef(g)} ${g.guidePath}${cDim(modeTag)}`);
  }
  if (queue.length < toFix.length) console.log(cDim(`  (limited to ${queue.length} of ${toFix.length})`));
  console.log('');

  if (options.dryRun) {
    console.log('🧪 Dry run — nothing was run. Planned from your local checkout; pull main first for an up-to-date plan.');
    return true;
  }

  const outcomes: Outcome[] = [];
  for (const [i, gap] of queue.entries()) {
    console.log(cBold(`\n[${i + 1}/${queue.length}] ${formatGapRef(gap)} ${gap.guidePath}`));
    outcomes.push(await fixOne(gap, options));

    // Stop if cleanup left something behind; it would leak into the next guide's PR.
    const status = evalGapFixCli.treeStatus();
    if (evalGapFixCli.currentBranch() !== 'main' || status !== '') {
      console.error(cRed('\n❌ Could not get back to a clean `main`; stopping the batch.'));
      if (status) console.error(cDim(status));
      break;
    }
  }

  console.log(cBold('\nSummary'));
  for (const o of outcomes) {
    const isSuccess = o.status === 'pr-opened' || o.status === 'pr-updated';
    const color = isSuccess ? cGreen : cRed;
    console.log(`  ${color(o.status.padEnd(10))} ${formatGapRef(o.gap)} ${o.gap.guidePath} ${cDim(`— ${o.detail}`)}`);
  }
  const notRun = queue.length - outcomes.length;
  if (notRun > 0) console.log(cDim(`  ${notRun} guide(s) not attempted`));

  return notRun === 0 && outcomes.every(o => o.status === 'pr-opened' || o.status === 'pr-updated');
}

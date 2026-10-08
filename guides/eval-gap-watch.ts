/**
 * Eval gap watch.
 *
 * Files GitHub issues for two eval-health gaps:
 *
 *   1. `missing-evals`        — a guide has guidance and expectations, but no evals.
 *   2. `expectations-changed` — a guide that already has evals had its
 *                               expectations.md edited in a push that didn't
 *                               also touch its evals, so they may be stale.
 *
 * Issues are keyed by a hidden marker comment so reruns don't file duplicates.
 * `missing-evals` issues close themselves once evals land.
 *
 * Usage: node --experimental-strip-types guides/eval-gap-watch.ts [--dry-run]
 */

import child_process from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  scanAllGuides,
  getGuideStatus,
  ProjectStatus,
  EXPECTATIONS_FILE,
  GRADER_FILE,
  TARGETS_DIR,
  type GuideInventory,
} from '../lib/guide-validation.ts';
import { rootDir } from '../lib/paths.ts';

export const EVAL_OWNERS = ['micahjo7', 'TravenReese'];
export const EVAL_GAP_LABEL = 'eval-gap';
export const USE_CASE_LABEL = 'new-use-case';
const PRIORITY_LABEL_REGEX = /^P\d+$/;

export type GapKind = 'missing-evals' | 'expectations-changed';

export interface Gap {
  kind: GapKind;
  /** Repo-relative guide directory, e.g. `guides/css/scrollspy`. */
  guidePath: string;
  guideName: string;
}

/** An open issue carrying the eval-gap label. */
export interface ExistingIssue {
  number: number;
  body: string;
  title: string;
  labels?: Array<{ name: string } | string>;
  milestone?: { title: string } | null;
}

/** A new-use-case issue used to carry priority and milestone forward to eval-gap issues. */
export interface UseCaseIssue {
  number: number;
  title: string;
  body: string;
  state?: string;
  labels?: Array<{ name: string } | string>;
  milestone?: { title: string } | null;
}

export interface UseCaseMetadata {
  priorityLabel: string | null;
  milestoneTitle: string | null;
}

export interface MetadataUpdate {
  issueNumber: number;
  title: string;
  addLabels: string[];
  removeLabels: string[];
  milestoneTitle: string | null;
}

// --- Detection ---

function toGap(kind: GapKind, inv: GuideInventory): Gap {
  return { kind, guidePath: path.relative(rootDir, inv.dir), guideName: inv.name };
}

/** Case 1: guidance and expectations are populated, but there are no evals. */
export function findMissingEvals(guides: GuideInventory[]): Gap[] {
  return guides
    .filter(inv => getGuideStatus(inv) === ProjectStatus.NeedsEvals)
    .map(inv => toGap('missing-evals', inv));
}

/** True when the changed files edit a guide's expectations.md without touching its evals. */
function editsExpectationsOnly(files: string[], guidePath: string): boolean {
  const inGuide = files.filter(f => f.startsWith(`${guidePath}/`)).map(f => f.slice(guidePath.length + 1));
  return inGuide.includes(EXPECTATIONS_FILE) &&
    !inGuide.some(f => f === GRADER_FILE || f.startsWith('tasks/') || f.startsWith(`${TARGETS_DIR}/`));
}

/** Case 2: a complete guide had expectations.md edited in a change that left its evals alone. */
export function findChangedExpectations(guides: GuideInventory[], changedFiles: string[]): Gap[] {
  return guides
    .filter(inv => getGuideStatus(inv) === null && editsExpectationsOnly(changedFiles, path.relative(rootDir, inv.dir)))
    .map(inv => toGap('expectations-changed', inv));
}

/** Repo-relative paths changed between a commit (e.g. a push's "before") and HEAD. */
export function getChangedFiles(before: string): string[] {
  try {
    const output = child_process.execFileSync('git', ['diff', '--name-only', before, 'HEAD'], {
      encoding: 'utf8',
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.split('\n').filter(Boolean);
  } catch {
    // e.g. the first push to a branch, or a force push that dropped `before`.
    console.warn(`⚠️ Could not diff ${before}..HEAD; skipping the expectations check.`);
    return [];
  }
}

// --- Issue content ---

export function buildMarker(kind: GapKind, guidePath: string): string {
  return `<!-- eval-gap-watch:${kind}:${guidePath} -->`;
}

export function parseMarker(body: string): { kind: GapKind; guidePath: string } | null {
  const match = body.match(/<!--\s*eval-gap-watch:(missing-evals|expectations-changed):(\S+?)\s*-->/);
  return match ? { kind: match[1] as GapKind, guidePath: match[2] } : null;
}

export function buildIssue(gap: Gap): { title: string; body: string } {
  const link = `[\`${gap.guidePath}\`](https://github.com/GoogleChrome/modern-web-guidance-src/tree/main/${gap.guidePath})`;

  const { title, summary, action } = gap.kind === 'missing-evals'
    ? {
        title: `Evals missing for the ${gap.guideName} guide`,
        summary: `${link} has guidance and populated \`${EXPECTATIONS_FILE}\`, but its evals are missing.`,
        action: `Run \`gd dev ${gap.guidePath}\` to create the evals.`,
      }
    : {
        title: `Expectations changed for the ${gap.guideName} guide`,
        summary: `\`${EXPECTATIONS_FILE}\` in ${link} was edited, and this guide already has evals.`,
        action: `Run \`gd dev ${gap.guidePath}\` to update the evals.`,
      };

  const body = [
    summary,
    '',
    action,
    '',
    '<sub>Filed automatically by `guides/eval-gap-watch.ts`.</sub>',
    buildMarker(gap.kind, gap.guidePath),
  ].join('\n');

  return { title, body };
}

function getLabelNames(labels: Array<{ name: string } | string> = []): string[] {
  return labels.map(l => (typeof l === 'string' ? l : l.name));
}

function isOpenState(state?: string): boolean {
  return !state || state.toLowerCase() === 'open';
}

/**
 * Resolves the priority label (`P0`/`P1`/`P2`) and milestone title from a guide's
 * `new-use-case` issue so `eval-gap` issues inherit the use case's priority.
 */
export function resolveUseCaseMetadata(
  guidePath: string,
  guideName: string,
  useCaseIssues: UseCaseIssue[]
): UseCaseMetadata {
  let matched: UseCaseIssue | undefined;
  for (const issue of useCaseIssues) {
    const subdirMatch = issue.body?.match(/Use case subdir: \[([^\]]+)\]/);
    const titleMatch = issue.title.match(/Create guide and evals for the (.+) use case/);
    const matchesPath = subdirMatch?.[1]?.trim() === guidePath;
    const matchesName = !subdirMatch && titleMatch?.[1]?.trim() === guideName;
    if (matchesPath || matchesName) {
      if (!matched || (!isOpenState(matched.state) && isOpenState(issue.state))) {
        matched = issue;
      }
    }
  }

  if (!matched) {
    return { priorityLabel: null, milestoneTitle: null };
  }

  const priorityLabel = getLabelNames(matched.labels).find(l => PRIORITY_LABEL_REGEX.test(l)) ?? null;
  const milestoneTitle = matched.milestone?.title ?? null;
  return { priorityLabel, milestoneTitle };
}

// --- Planning ---

/**
 * Returns the issues to file, close, and update, given the currently open issues.
 * Only `missing-evals` auto-closes, since it is recomputed from the tree every run;
 * `expectations-changed` is a point-in-time alert a human closes.
 */
export function planIssues(
  gaps: Gap[],
  existing: ExistingIssue[],
  useCaseIssues: UseCaseIssue[] = []
): { toCreate: Gap[]; toClose: ExistingIssue[]; toUpdate: MetadataUpdate[] } {
  const openIssues = new Map<string, ExistingIssue>();
  for (const issue of existing) {
    const marker = parseMarker(issue.body);
    if (marker) openIssues.set(`${marker.kind}:${marker.guidePath}`, issue);
  }

  const gapKeys = new Set(gaps.map(g => `${g.kind}:${g.guidePath}`));
  const toClose = [...openIssues]
    .filter(([key]) => key.startsWith('missing-evals:') && !gapKeys.has(key))
    .map(([, issue]) => issue);
  const closingNumbers = new Set(toClose.map(i => i.number));

  const toUpdate: MetadataUpdate[] = [];
  if (useCaseIssues.length > 0) {
    for (const issue of existing) {
      if (closingNumbers.has(issue.number) || !issue.labels) continue;
      const marker = parseMarker(issue.body);
      if (!marker) continue;
      const guideName = path.basename(marker.guidePath);
      const metadata = resolveUseCaseMetadata(marker.guidePath, guideName, useCaseIssues);
      const currentPrios = getLabelNames(issue.labels).filter(l => PRIORITY_LABEL_REGEX.test(l));
      const addLabels = metadata.priorityLabel && !currentPrios.includes(metadata.priorityLabel)
        ? [metadata.priorityLabel]
        : [];
      const removeLabels = currentPrios.filter(l => l !== metadata.priorityLabel);
      const currentMilestone = issue.milestone?.title ?? null;
      const milestoneTitle = metadata.milestoneTitle && currentMilestone !== metadata.milestoneTitle
        ? metadata.milestoneTitle
        : null;

      if (addLabels.length > 0 || removeLabels.length > 0 || milestoneTitle !== null) {
        toUpdate.push({
          issueNumber: issue.number,
          title: issue.title,
          addLabels,
          removeLabels,
          milestoneTitle,
        });
      }
    }
  }

  return {
    toCreate: gaps.filter(g => !openIssues.has(`${g.kind}:${g.guidePath}`)),
    toClose,
    toUpdate,
  };
}

// --- GitHub API ---

export const githubApi = {
  ensureLabel(): void {
    try {
      child_process.execFileSync(
        'gh',
        ['label', 'create', EVAL_GAP_LABEL, '--description', 'Guide is missing evals or its expectations changed', '--color', 'B60205'],
        { stdio: 'pipe' }
      );
    } catch {
      // Label already exists, which is the common case.
    }
  },

  listIssues(): ExistingIssue[] {
    const output = child_process.execFileSync(
      'gh',
      ['issue', 'list', '--label', EVAL_GAP_LABEL, '--state', 'open', '--limit', '500', '--json', 'number,body,title,labels,milestone'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    );
    return (JSON.parse(output) as ExistingIssue[]).map(i => ({ ...i, body: i.body ?? '' }));
  },

  listUseCaseIssues(): UseCaseIssue[] {
    const output = child_process.execFileSync(
      'gh',
      ['issue', 'list', '--label', USE_CASE_LABEL, '--state', 'all', '--limit', '1000', '--json', 'number,title,body,state,labels,milestone'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    );
    return (JSON.parse(output) as UseCaseIssue[]).map(i => ({ ...i, body: i.body ?? '' }));
  },

  createIssue(title: string, body: string, metadata?: UseCaseMetadata): void {
    const labels = [EVAL_GAP_LABEL, ...(metadata?.priorityLabel ? [metadata.priorityLabel] : [])];
    const args = [
      'issue',
      'create',
      '--title',
      title,
      '--body',
      body,
      '--label',
      labels.join(','),
      '--assignee',
      EVAL_OWNERS.join(','),
      ...(metadata?.milestoneTitle ? ['--milestone', metadata.milestoneTitle] : []),
    ];
    child_process.execFileSync('gh', args, { stdio: 'inherit' });
  },

  updateIssue(update: MetadataUpdate): void {
    const args = ['issue', 'edit', String(update.issueNumber)];
    if (update.addLabels.length > 0) {
      args.push('--add-label', update.addLabels.join(','));
    }
    if (update.removeLabels.length > 0) {
      args.push('--remove-label', update.removeLabels.join(','));
    }
    if (update.milestoneTitle) {
      args.push('--milestone', update.milestoneTitle);
    }
    child_process.execFileSync('gh', args, { stdio: 'inherit' });
  },

  closeIssue(issueNumber: number): void {
    child_process.execFileSync(
      'gh',
      ['issue', 'close', String(issueNumber), '--reason', 'completed', '--comment', 'Closing — this guide no longer has a missing-evals gap.'],
      { stdio: 'inherit' }
    );
  },
};

// --- Main ---

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const dryRun = argv.includes('--dry-run') || process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
  if (dryRun) console.log('🧪 Dry run — no issues will be filed or closed.\n');

  // The push's "before" commit. Manual runs have none, so they only check for missing evals.
  const before = process.env.EVAL_GAP_BEFORE;

  const guides = scanAllGuides();
  const changedFiles = before ? getChangedFiles(before) : [];

  const gaps = [...findMissingEvals(guides), ...findChangedExpectations(guides, changedFiles)];
  console.log(`Scanned ${guides.length} guides and ${changedFiles.length} changed file(s), found ${gaps.length} gap(s).`);

  const useCaseIssues = githubApi.listUseCaseIssues();
  const { toCreate, toClose, toUpdate } = planIssues(gaps, githubApi.listIssues(), useCaseIssues);

  if (toCreate.length === 0 && toClose.length === 0 && toUpdate.length === 0) {
    console.log('✅ No changes needed.');
    return;
  }

  if (!dryRun && toCreate.length > 0) githubApi.ensureLabel();

  for (const gap of toCreate) {
    const { title, body } = buildIssue(gap);
    const metadata = resolveUseCaseMetadata(gap.guidePath, gap.guideName, useCaseIssues);
    if (dryRun) {
      const labelInfo = [EVAL_GAP_LABEL, ...(metadata.priorityLabel ? [metadata.priorityLabel] : [])].join(', ');
      const milestoneInfo = metadata.milestoneTitle ? `, milestone="${metadata.milestoneTitle}"` : '';
      console.log(`[DRY RUN] Would file "${title}" (labels=[${labelInfo}]${milestoneInfo})`);
      continue;
    }
    githubApi.createIssue(title, body, metadata);
  }

  for (const update of toUpdate) {
    if (dryRun) {
      console.log(`[DRY RUN] Would update #${update.issueNumber} ("${update.title}"): +[${update.addLabels.join(', ')}] -[${update.removeLabels.join(', ')}]${update.milestoneTitle ? ` milestone="${update.milestoneTitle}"` : ''}`);
      continue;
    }
    githubApi.updateIssue(update);
  }

  for (const issue of toClose) {
    if (dryRun) {
      console.log(`[DRY RUN] Would close #${issue.number} ("${issue.title}")`);
      continue;
    }
    githubApi.closeIssue(issue.number);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

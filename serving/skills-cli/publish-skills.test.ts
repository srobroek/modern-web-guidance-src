import test from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ghpages, { type Git } from 'gh-pages';
import {
  cloneDir,
  distributionPublishOptions,
  getNextVersion,
  isPublishedToDistributionRepo,
  withoutUnpublishedBins,
} from './publish-skills.ts';

test('getNextVersion derive from git tag', async () => {
  const mockGetTag = () => 'v0.0.22';
  
  const version = await getNextVersion(mockGetTag);
  assert.strictEqual(version, '0.0.23');
});

test('isPublishedToDistributionRepo excludes bundled scripts', () => {
  assert.strictEqual(isPublishedToDistributionRepo('skills/modern-web-guidance/SKILL.md'), true);
  assert.strictEqual(isPublishedToDistributionRepo('skills/modern-web-guidance/modern-web.mjs'), false);
});

test('withoutUnpublishedBins drops bin entries whose target is not pushed to GitHub', () => {
  const manifest = {
    name: 'modern-web-guidance',
    version: '0.0.1',
    bin: { 'modern-web-guidance': 'skills/modern-web-guidance/modern-web.mjs' },
  };
  assert.deepStrictEqual(withoutUnpublishedBins(manifest), { name: 'modern-web-guidance', version: '0.0.1' });
  assert.deepStrictEqual(withoutUnpublishedBins({ name: 'x', bin: './modern-web.mjs' }), { name: 'x' });
});

test('withoutUnpublishedBins keeps bin entries whose target is published', () => {
  const manifest = { name: 'x', bin: { keep: './bin/run.sh', drop: 'bin/run.mjs' } };
  assert.deepStrictEqual(withoutUnpublishedBins(manifest), { name: 'x', bin: { keep: './bin/run.sh' } });
  assert.deepStrictEqual(withoutUnpublishedBins({ name: 'x' }), { name: 'x' });
});

test('cloneDir rejects a Git object without a working directory', () => {
  assert.throws(() => cloneDir({} as Git), /no cwd/);
});

test('distribution publish strips unpublished bins in a real gh-pages clone', async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mwg-publish-'));
  const remote = path.join(tmp, 'distribution.git');
  const seed = path.join(tmp, 'seed');
  const publishCliDir = path.join(tmp, 'skills-cli');

  // gh-pages spawns git with process.env; isolate it from the developer's git config
  // (commit signing, hooks, default branch) so the test only exercises our hook.
  const savedEnv = { ...process.env };
  const gitConfig = path.join(tmp, 'gitconfig');
  await fs.writeFile(gitConfig, '');
  Object.assign(process.env, {
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  });
  t.after(async () => {
    process.env = savedEnv;
    await fs.rm(ghpages.getCacheDir(remote), { recursive: true, force: true });
    await fs.rm(tmp, { recursive: true, force: true });
  });
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });

  // Distribution repo with an existing release on main.
  git(tmp, 'init', '--quiet', '--bare', '--initial-branch=main', remote);
  git(tmp, 'clone', '--quiet', remote, seed);
  await fs.writeFile(path.join(seed, 'stale.txt'), 'from the previous release\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '--quiet', '-m', 'Release v0.0.1');
  git(seed, 'push', '--quiet', 'origin', 'HEAD:main');

  // Built dist/skills-cli/: npm needs the bin, the GitHub repo does not ship its target.
  const skillDir = path.join(publishCliDir, 'skills/modern-web-guidance');
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# skill\n');
  await fs.writeFile(path.join(skillDir, 'modern-web.mjs'), '#!/usr/bin/env node\n');
  const sourceManifest = JSON.stringify({
    name: 'modern-web-guidance',
    version: '0.0.2',
    bin: { 'modern-web-guidance': 'skills/modern-web-guidance/modern-web.mjs' },
  }, null, 2) + '\n';
  await fs.writeFile(path.join(publishCliDir, 'package.json'), sourceManifest);

  await new Promise<void>((resolve, reject) => {
    ghpages.publish(publishCliDir, distributionPublishOptions('0.0.2', remote), (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const published = JSON.parse(git(tmp, '--git-dir', remote, 'show', 'main:package.json'));
  assert.deepStrictEqual(published, { name: 'modern-web-guidance', version: '0.0.2' });
  const files = git(tmp, '--git-dir', remote, 'ls-tree', '-r', '--name-only', 'main').trim().split('\n').sort();
  assert.deepStrictEqual(files, ['package.json', 'skills/modern-web-guidance/SKILL.md']);
  assert.strictEqual(git(tmp, '--git-dir', remote, 'tag', '--list', 'v0.0.2').trim(), 'v0.0.2');
  // The hook edits the clone only; the npm package keeps its bin.
  assert.strictEqual(await fs.readFile(path.join(publishCliDir, 'package.json'), 'utf8'), sourceManifest);
});



import test from 'node:test';
import assert from 'node:assert';
import { getNextVersion, isPublishedToDistributionRepo, withoutUnpublishedBins } from './publish-skills.ts';

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



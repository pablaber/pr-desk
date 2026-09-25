import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { releaseMetadata, updateCask } from './update-homebrew.mjs';

const version = '0.2.0';
const sha256 = createHash('sha256').update('DMG contents').digest('hex');
const cask = `cask "pr-desk" do
  version "0.1.0"
  sha256 "${'a'.repeat(64)}"

  app "PR Desk.app"
end
`;

test('updates only version/checksum and is idempotent', () => {
  const updated = updateCask(cask, version, sha256);
  assert.equal(updated, cask.replace('0.1.0', version).replace('a'.repeat(64), sha256));
  assert.equal(updateCask(updated, version, sha256), updated);
});

test('rejects missing/duplicate stanzas and invalid release metadata', () => {
  for (const invalid of [cask.replace('  version', '  other'), `${cask}  version "1.0.0"\n`]) {
    assert.throws(() => updateCask(invalid, version, sha256));
  }
  assert.throws(() => updateCask(cask, '', sha256));
  assert.throws(() => updateCask(cask, '0.2.0"\nmalicious', sha256));
  assert.throws(() => updateCask(cask, version, ':no_check'));
});

test('requires the published release to contain the exact local DMG', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pr-desk-dmg-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const name = 'PR.Desk_0.2.0_aarch64.dmg';
  const release = {
    tag_name: 'v0.2.0',
    draft: false,
    prerelease: false,
    assets: [
      {
        name,
        state: 'uploaded',
        digest: `sha256:${sha256}`,
        browser_download_url: `https://github.com/pablaber/pr-desk/releases/download/v0.2.0/${name}`,
      },
    ],
  };
  assert.throws(() => releaseMetadata(release, version, directory));
  writeFileSync(join(directory, 'PR Desk_0.2.0_aarch64.dmg'), 'DMG contents');
  assert.deepEqual(releaseMetadata(release, version, directory), { version, sha256 });
  for (const patch of [
    { draft: true },
    { prerelease: true },
    { tag_name: 'v0.1.0' },
    { assets: [] },
    { assets: [...release.assets, ...release.assets] },
    { assets: [{ ...release.assets[0], digest: `sha256:${'b'.repeat(64)}` }] },
    { assets: [{ ...release.assets[0], state: 'new' }] },
    { assets: [{ ...release.assets[0], browser_download_url: 'https://example.com/app.dmg' }] },
  ]) {
    assert.throws(() => releaseMetadata({ ...release, ...patch }, version, directory));
  }
  writeFileSync(join(directory, 'another.dmg'), 'extra');
  assert.throws(() => releaseMetadata(release, version, directory));
});

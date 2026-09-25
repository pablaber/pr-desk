import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const shaPattern = /^[a-f0-9]{64}$/;

// Only publish metadata after the exact locally built DMG is present on the release.
export function releaseMetadata(release, version, bundleDirectory) {
  assert.match(version, versionPattern);
  assert.equal(release.tag_name, `v${version}`);
  assert.equal(release.draft, false);
  assert.equal(release.prerelease, false);
  const files = readdirSync(bundleDirectory).filter((file) => file.endsWith('.dmg'));
  assert.equal(files.length, 1, 'Expected exactly one built DMG');
  const assetName = `PR.Desk_${version}_aarch64.dmg`;
  assert.equal(files[0].replaceAll(' ', '.'), assetName);
  const sha256 = createHash('sha256')
    .update(readFileSync(join(bundleDirectory, files[0])))
    .digest('hex');
  const assets = release.assets.filter((asset) => asset.name === assetName);
  assert.equal(assets.length, 1, 'Expected the uploaded DMG on the release');
  assert.equal(assets[0].state, 'uploaded');
  assert.equal(assets[0].digest, `sha256:${sha256}`, 'Uploaded DMG differs from local build');
  assert.equal(
    assets[0].browser_download_url,
    `https://github.com/pablaber/pr-desk/releases/download/v${version}/${assetName}`,
  );
  return { version, sha256 };
}

export function updateCask(cask, version, sha256) {
  assert.match(version, versionPattern);
  assert.match(sha256, shaPattern);
  for (const field of ['version', 'sha256']) {
    assert.equal(
      [...cask.matchAll(new RegExp(`^  ${field} "[^"\\n]+"$`, 'gm'))].length,
      1,
      `Expected exactly one ${field} stanza`,
    );
  }
  const updated = cask
    .replace(/^  version "[^"\n]+"$/m, `  version "${version}"`)
    .replace(/^  sha256 "[^"\n]+"$/m, `  sha256 "${sha256}"`);
  assert.ok(updated.includes(`  version "${version}"\n`));
  assert.ok(updated.includes(`  sha256 "${sha256}"\n`));
  return updated;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, file, ...args] = process.argv.slice(2);
  if (command === 'metadata') {
    const release = JSON.parse(readFileSync(file, 'utf8'));
    const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
    const metadata = releaseMetadata(release, version, args[0]);
    for (const [key, value] of Object.entries(metadata)) console.log(`${key}=${value}`);
  } else if (command === 'update') {
    writeFileSync(file, updateCask(readFileSync(file, 'utf8'), args[0], args[1]));
  } else {
    throw new Error(
      'Expected metadata <release.json> <DMG directory> or update <cask> <version> <sha256>',
    );
  }
}

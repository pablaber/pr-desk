import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
const releaseDownloadBase = 'https://github.com/pablaber/pr-desk/releases/download';

// tauri-action uploads the updater archive as `<app name>_<arch>.app.tar.gz` (no version) and
// GitHub replaces the space with a dot. The local files keep the product name as built.
const localArchive = 'PR Desk.app.tar.gz';
const archiveAsset = 'PR.Desk_aarch64.app.tar.gz';
const signatureAsset = `${archiveAsset}.sig`;
const latestAsset = 'latest.json';
const platformKey = 'darwin-aarch64';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const decodeBase64 = (text, label) => {
  assert.match(text, base64Pattern, `${label} is not base64`);
  return Buffer.from(text, 'base64');
};
const downloadUrl = (version, name) => `${releaseDownloadBase}/v${version}/${name}`;

// ed25519 SubjectPublicKeyInfo header; minisign public keys are the raw 32-byte key.
const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');

// Parses the base64-wrapped minisign text Tauri uses for both its public key and signatures.
function minisignLines(wrapped, label) {
  const lines = decodeBase64(wrapped.trim(), label).toString('utf8').split('\n');
  assert.ok(lines[0]?.startsWith('untrusted comment: '), `${label} is not a minisign document`);
  return lines;
}

// Equivalent of `minisign -V` for the signature Tauri writes next to the updater archive, so a
// private key that does not match the public key shipped in the app fails before publication.
export function verifySignature(archive, signatureFile, publicKeyFile) {
  const publicKey = decodeBase64(minisignLines(publicKeyFile, 'Updater public key')[1], 'Key');
  assert.equal(publicKey.length, 42, 'Updater public key has an unexpected length');
  assert.equal(publicKey.subarray(0, 2).toString(), 'Ed', 'Updater public key is not Ed25519');
  const key = createPublicKey({
    key: Buffer.concat([ed25519SpkiPrefix, publicKey.subarray(10)]),
    format: 'der',
    type: 'spki',
  });

  const lines = minisignLines(signatureFile, 'Updater signature');
  const signature = decodeBase64(lines[1], 'Updater signature');
  assert.equal(signature.length, 74, 'Updater signature has an unexpected length');
  assert.ok(
    signature.subarray(2, 10).equals(publicKey.subarray(2, 10)),
    'Updater signature was made with a different key than the configured public key',
  );
  const algorithm = signature.subarray(0, 2).toString();
  assert.ok(algorithm === 'ED' || algorithm === 'Ed', 'Unsupported updater signature algorithm');
  const message = algorithm === 'ED' ? createHash('blake2b512').update(archive).digest() : archive;
  assert.ok(
    verify(null, message, key, signature.subarray(10)),
    'Updater signature does not match the archive',
  );

  assert.ok(lines[2]?.startsWith('trusted comment: '), 'Updater signature has no trusted comment');
  const trustedComment = Buffer.from(lines[2].slice('trusted comment: '.length));
  const globalSignature = decodeBase64(lines[3] ?? '', 'Updater global signature');
  assert.ok(
    verify(null, Buffer.concat([signature.subarray(10), trustedComment]), key, globalSignature),
    'Updater signature comment does not match its signature',
  );
}

function assertPublishedRelease(release, version) {
  assert.match(version, versionPattern);
  assert.equal(release.tag_name, `v${version}`);
  assert.equal(release.draft, false);
  assert.equal(release.prerelease, false);
}

// The uploaded asset must be the exact bytes held locally and served from the exact tag.
function assertUploadedAsset(release, version, name, bytes) {
  const assets = release.assets.filter((asset) => asset.name === name);
  assert.equal(assets.length, 1, `Expected ${name} on the release`);
  assert.equal(assets[0].state, 'uploaded');
  assert.equal(assets[0].digest, `sha256:${sha256(bytes)}`, `Uploaded ${name} differs from local`);
  assert.equal(assets[0].browser_download_url, downloadUrl(version, name));
}

// Proves the published archive and signature are the locally verified, correctly signed files.
export function verifyUpdaterArtifacts(release, version, bundleDirectory, publicKey) {
  assertPublishedRelease(release, version);
  const macosDirectory = join(bundleDirectory, 'macos');
  const archive = readFileSync(join(macosDirectory, localArchive));
  const signatureFile = readFileSync(join(macosDirectory, `${localArchive}.sig`));
  assert.ok(archive.length > 0, 'The updater archive is empty');
  const signature = signatureFile.toString('utf8').trim();
  verifySignature(archive, signature, publicKey);
  assertUploadedAsset(release, version, archiveAsset, archive);
  assertUploadedAsset(release, version, signatureAsset, signatureFile);
  return { signature };
}

export function latestJson(release, version, signature) {
  assertPublishedRelease(release, version);
  assert.ok(signature.length > 0);
  assert.ok(release.body == null || typeof release.body === 'string');
  const published = new Date(typeof release.published_at === 'string' ? release.published_at : NaN);
  assert.ok(!Number.isNaN(published.getTime()), 'Release has no valid publication date');
  return {
    version,
    notes: (release.body ?? '').trim(),
    pub_date: published.toISOString(),
    platforms: {
      [platformKey]: { signature, url: downloadUrl(version, archiveAsset) },
    },
  };
}

// Checks the published latest.json is the local file and points at this tag's archive.
export function verifyLatestJson(release, version, latestBytes) {
  assertPublishedRelease(release, version);
  assertUploadedAsset(release, version, latestAsset, latestBytes);
  const latest = JSON.parse(latestBytes.toString('utf8'));
  assert.equal(latest.version, version);
  assert.deepEqual(Object.keys(latest.platforms), [platformKey]);
  assert.equal(latest.platforms[platformKey].url, downloadUrl(version, archiveAsset));
  assert.ok(latest.platforms[platformKey].signature.length > 0);
  assert.equal(new Date(latest.pub_date).toISOString(), latest.pub_date);
  return latest;
}

const usage =
  'Expected verify <release.json> <bundle directory> <tauri.conf.json>, ' +
  'latest <release.json> <bundle directory> <tauri.conf.json> <output>, or ' +
  'verify-latest <release.json> <latest.json>';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, releaseFile, ...args] = process.argv.slice(2);
  const release = JSON.parse(readFileSync(releaseFile, 'utf8'));
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const readPublicKey = (configFile) => {
    const config = JSON.parse(readFileSync(configFile, 'utf8'));
    const publicKey = config.plugins?.updater?.pubkey;
    assert.ok(publicKey, `${configFile} has no plugins.updater.pubkey`);
    return publicKey;
  };
  if (command === 'verify' || command === 'latest') {
    const { signature } = verifyUpdaterArtifacts(release, version, args[0], readPublicKey(args[1]));
    console.log(`Verified signed updater archive for ${version}`);
    if (command === 'latest') {
      writeFileSync(
        args[2],
        `${JSON.stringify(latestJson(release, version, signature), null, 2)}\n`,
      );
    }
  } else if (command === 'verify-latest') {
    verifyLatestJson(release, version, readFileSync(args[0]));
    console.log(`Verified published ${latestAsset} for ${version}`);
  } else {
    throw new Error(usage);
  }
}

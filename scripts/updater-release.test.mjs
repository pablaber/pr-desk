import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  latestJson,
  verifyLatestJson,
  verifySignature,
  verifyUpdaterArtifacts,
} from './updater-release.mjs';

const version = '0.2.0';
const archiveName = 'PR.Desk_aarch64.app.tar.gz';
const base = `https://github.com/pablaber/pr-desk/releases/download/v${version}`;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const b64 = (value) => Buffer.from(value).toString('base64');

// Real output of `tauri signer generate` and `tauri signer sign` for a file containing "hello\n".
const tauriPublicKey =
  'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDRGMzlCMTc4RjYwNkU1MDEKUldRQjVRYjJlTEU1VDcyYjY1dXJEa1N5MkYxNE0ycDlJMkVDcG4vZ0huRVpMZ1hMSjQrb1luK1UK';
const tauriSignature =
  'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVRQjVRYjJlTEU1VDFmSHVHQzRSTm50c1huRSs2RGphSkJUOHhYZzR1U0ZlbkFuS2VFaFdkbHZjOS85VFNZSkxlb1BqL2x1SFk2UTcxRlhRSXJHTDhwUkkrZm1CdVdmRVE0PQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkxOTE4NDM4CWZpbGU6Zi50eHQKVndkWEJjWkE0SjlubXlkTm5xUGdaVHpCU0krUGUxbk02eFJmQWxHb2NzS0RRZ3UyYkdTTXVkcldsaGZlMU1weDhZRFNWMXVwQm85ZnI3emozZDBnQ3c9PQo=';

// Minimal minisign signer so tests can produce matching and mismatching key pairs.
function keyPair(id = 1) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const keyId = Buffer.alloc(8, id);
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  const publicKeyFile = b64(
    `untrusted comment: minisign public key\n${Buffer.concat([Buffer.from('Ed'), keyId, raw]).toString('base64')}\n`,
  );
  const signFile = (data, { prehashed = true } = {}) => {
    const message = prehashed ? createHash('blake2b512').update(data).digest() : data;
    const signature = sign(null, message, privateKey);
    const comment = 'timestamp:1\tfile:app.tar.gz';
    const global = sign(null, Buffer.concat([signature, Buffer.from(comment)]), privateKey);
    const alg = Buffer.from(prehashed ? 'ED' : 'Ed');
    return b64(
      `untrusted comment: signature from tauri secret key\n${Buffer.concat([alg, keyId, signature]).toString('base64')}\ntrusted comment: ${comment}\n${global.toString('base64')}\n`,
    );
  };
  return { publicKeyFile, signFile };
}

test('accepts a real Tauri signature and rejects other data', () => {
  verifySignature(Buffer.from('hello\n'), tauriSignature, tauriPublicKey);
  assert.throws(() => verifySignature(Buffer.from('hello'), tauriSignature, tauriPublicKey));
});

test('verifies minisign signatures against the configured key only', () => {
  const data = Buffer.from('archive bytes');
  const { publicKeyFile, signFile } = keyPair();
  verifySignature(data, signFile(data), publicKeyFile);
  verifySignature(data, signFile(data, { prehashed: false }), publicKeyFile);
  assert.throws(() => verifySignature(Buffer.from('tampered'), signFile(data), publicKeyFile));
  assert.throws(() => verifySignature(data, signFile(data), keyPair(2).publicKeyFile), /different/);
  // Same key id, different key: the signature itself must fail.
  assert.throws(() => verifySignature(data, signFile(data), keyPair(1).publicKeyFile), /match/);
  for (const invalid of [
    '',
    'not base64!',
    b64('plain text\nline'),
    b64('untrusted comment: x\n'),
  ]) {
    assert.throws(() => verifySignature(data, invalid, publicKeyFile));
    assert.throws(() => verifySignature(data, signFile(data), invalid));
  }
  // The trusted comment is covered by the global signature.
  const wrapped = Buffer.from(signFile(data), 'base64')
    .toString()
    .replace('timestamp:1', 'timestamp:2');
  assert.throws(() => verifySignature(data, b64(wrapped), publicKeyFile), /comment/);
});

function fixture(t, { signed = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'pr-desk-updater-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const macos = join(directory, 'macos');
  mkdirSync(macos);
  const archive = Buffer.from('archive bytes');
  const { publicKeyFile, signFile } = keyPair();
  const signature = Buffer.from(signed ? signFile(archive) : 'bad');
  writeFileSync(join(macos, 'PR Desk.app.tar.gz'), archive);
  writeFileSync(join(macos, 'PR Desk.app.tar.gz.sig'), signature);
  const asset = (name, bytes) => ({
    name,
    state: 'uploaded',
    digest: `sha256:${sha256(bytes)}`,
    browser_download_url: `${base}/${name}`,
  });
  const release = {
    tag_name: `v${version}`,
    draft: false,
    prerelease: false,
    body: '## 0.2.0\n\n* a change\n',
    published_at: '2026-10-13T18:14:29Z',
    assets: [asset(archiveName, archive), asset(`${archiveName}.sig`, signature)],
  };
  return { directory, release, publicKeyFile, signature: signature.toString(), asset };
}

test('requires the published archive and signature to be the verified local files', (t) => {
  const { directory, release, publicKeyFile, signature } = fixture(t);
  assert.deepEqual(verifyUpdaterArtifacts(release, version, directory, publicKeyFile), {
    signature,
  });
  const [archive, sig] = release.assets;
  for (const patch of [
    { draft: true },
    { prerelease: true },
    { tag_name: 'v0.1.0' },
    { assets: [] },
    { assets: [archive] },
    { assets: [sig] },
    { assets: [...release.assets, archive] },
    { assets: [{ ...archive, digest: `sha256:${'b'.repeat(64)}` }, sig] },
    { assets: [archive, { ...sig, digest: `sha256:${'b'.repeat(64)}` }] },
    { assets: [{ ...archive, state: 'new' }, sig] },
    { assets: [{ ...archive, browser_download_url: `${base}/other.tar.gz` }, sig] },
    {
      assets: [
        {
          ...archive,
          browser_download_url: archive.browser_download_url.replace('v0.2.0', 'latest'),
        },
        sig,
      ],
    },
  ]) {
    assert.throws(() =>
      verifyUpdaterArtifacts({ ...release, ...patch }, version, directory, publicKeyFile),
    );
  }
  assert.throws(() => verifyUpdaterArtifacts(release, version, directory, keyPair().publicKeyFile));
  assert.throws(() =>
    verifyUpdaterArtifacts(release, version, join(directory, 'missing'), publicKeyFile),
  );
  assert.throws(() => verifyUpdaterArtifacts(release, '0.2', directory, publicKeyFile));
});

test('rejects an unsigned or malformed local signature', (t) => {
  const { directory, release, publicKeyFile } = fixture(t, { signed: false });
  assert.throws(() => verifyUpdaterArtifacts(release, version, directory, publicKeyFile));
});

test('generates latest.json tied to the exact tag', (t) => {
  const { release, signature } = fixture(t);
  assert.deepEqual(latestJson(release, version, signature), {
    version,
    notes: '## 0.2.0\n\n* a change',
    pub_date: '2026-10-13T18:14:29.000Z',
    platforms: { 'darwin-aarch64': { signature, url: `${base}/${archiveName}` } },
  });
  assert.equal(latestJson({ ...release, body: null }, version, signature).notes, '');
  for (const [patch, sig] of [
    [{ draft: true }, signature],
    [{ prerelease: true }, signature],
    [{ tag_name: 'v0.1.0' }, signature],
    [{ published_at: null }, signature],
    [{ body: 7 }, signature],
    [{}, ''],
  ]) {
    assert.throws(() => latestJson({ ...release, ...patch }, version, sig));
  }
  assert.throws(() => latestJson(release, 'latest', signature));
});

test('verifies the uploaded latest.json before it is trusted', (t) => {
  const { release, signature, asset } = fixture(t);
  const bytes = Buffer.from(JSON.stringify(latestJson(release, version, signature)));
  const published = { ...release, assets: [...release.assets, asset('latest.json', bytes)] };
  assert.equal(verifyLatestJson(published, version, bytes).version, version);
  assert.throws(() => verifyLatestJson(release, version, bytes));
  assert.throws(() => verifyLatestJson(published, version, Buffer.from('{}')));
  const edit = (change) => {
    const latest = JSON.parse(bytes);
    change(latest);
    const edited = Buffer.from(JSON.stringify(latest));
    return [{ ...release, assets: [...release.assets, asset('latest.json', edited)] }, edited];
  };
  for (const change of [
    (latest) => (latest.version = '0.1.0'),
    (latest) => (latest.platforms['darwin-aarch64'].url = 'https://example.com/app.tar.gz'),
    (latest) => (latest.platforms['darwin-aarch64'].signature = ''),
    (latest) => (latest.platforms['darwin-x86_64'] = latest.platforms['darwin-aarch64']),
    (latest) => (latest.pub_date = 'yesterday'),
  ]) {
    const [tampered, edited] = edit(change);
    assert.throws(() => verifyLatestJson(tampered, version, edited));
  }
});

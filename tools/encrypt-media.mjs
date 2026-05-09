import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, basename, extname, dirname } from 'node:path';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'src/assets/media_processed');
const OUT_DIR = join(ROOT, 'public/encrypted');

const HEX = process.env.GALLERY_KEY;
if (!HEX || !/^[0-9a-f]{64}$/i.test(HEX)) {
  console.error('GALLERY_KEY must be 64 hex chars.');
  process.exit(1);
}

const keyBytes = new Uint8Array(HEX.match(/.{2}/g).map((b) => parseInt(b, 16)));
const cryptoKey = await webcrypto.subtle.importKey(
  'raw',
  keyBytes,
  { name: 'AES-GCM' },
  false,
  ['encrypt']
);

async function pack(plaintext) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const cipher = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    plaintext
  );
  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), iv.length);
  return out;
}

async function packFile(srcPath, outPath) {
  const data = await readFile(srcPath);
  const out = await pack(data);
  await writeFile(outPath, out);
  return out.byteLength;
}

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const files = (await readdir(SRC_DIR))
  .filter((f) => !f.startsWith('.'))
  .sort((a, b) => {
    const na = parseInt(basename(a, extname(a)), 10);
    const nb = parseInt(basename(b, extname(b)), 10);
    return na - nb;
  });

const items = [];
let totalBytes = 0;
for (const f of files) {
  const ext = extname(f).toLowerCase();
  const id = basename(f, ext);
  const type =
    ext === '.mp4' || ext === '.webm' || ext === '.m4v' ? 'video' : 'image';
  const outName = `${id}.bin`;
  const size = await packFile(join(SRC_DIR, f), join(OUT_DIR, outName));
  items.push({ id, type, ext: ext.slice(1), file: outName });
  totalBytes += size;
  process.stdout.write(`\r  ${items.length}/${files.length}`);
}
process.stdout.write('\n');

const manifestBytes = new TextEncoder().encode(JSON.stringify({ items }));
const manifestEncrypted = await pack(manifestBytes);
await writeFile(join(OUT_DIR, 'manifest.bin'), manifestEncrypted);

const mb = (totalBytes / 1024 / 1024).toFixed(1);
console.log(`done — ${items.length} files, ${mb} MB`);

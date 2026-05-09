const subtle = window.crypto?.subtle;
const HEX_RE = /^[0-9a-f]{64}$/i;

export function isValidHex(hex) {
  return typeof hex === 'string' && HEX_RE.test(hex);
}

export function readHexFromUrl() {
  const h = (window.location.hash || '').replace(/^#/, '').trim();
  return isValidHex(h) ? h.toLowerCase() : null;
}

async function importKey(hex) {
  const bytes = new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));
  return subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function open(buffer, key) {
  const buf = new Uint8Array(buffer);
  const iv = buf.subarray(0, 12);
  const body = buf.subarray(12);
  return subtle.decrypt({ name: 'AES-GCM', iv }, key, body);
}

function assetUrl(name) {
  return new URL(`encrypted/${name}`, document.baseURI).href;
}

export async function unlock(hex) {
  if (!subtle) return null;
  if (!isValidHex(hex)) return null;
  try {
    const key = await importKey(hex);
    const res = await fetch(assetUrl('manifest.bin'), { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await open(await res.arrayBuffer(), key);
    const manifest = JSON.parse(new TextDecoder().decode(data));
    if (!manifest || !Array.isArray(manifest.items)) return null;
    return { key, manifest };
  } catch {
    return null;
  }
}

const MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  m4v: 'video/mp4',
};

export async function decryptToBlobUrl(item, key) {
  const res = await fetch(assetUrl(item.file), { cache: 'force-cache' });
  if (!res.ok) throw new Error(`fetch ${item.file}: ${res.status}`);
  const data = await open(await res.arrayBuffer(), key);
  const mime = MIME[item.ext] || 'application/octet-stream';
  return URL.createObjectURL(new Blob([data], { type: mime }));
}

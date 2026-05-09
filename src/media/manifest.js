import { decryptToBlobUrl } from '../access/decrypt.js';

export async function buildManifest({ key, manifest }) {
  const results = await Promise.allSettled(
    manifest.items.map((item) =>
      decryptToBlobUrl(item, key).then((url) => ({
        path: url,
        type: item.type,
        source: item.id,
      }))
    )
  );
  const entries = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') entries.push(r.value);
    else console.warn(`[manifest] item ${manifest.items[i].id}:`, r.reason);
  }
  return entries;
}

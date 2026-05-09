import * as THREE from 'three';

const MAX_IMAGE_DIMENSION = 512;
// Cap drástico: cada <video> ativo significa um decoder de hardware/software
// e um upload de frame por tick. Com 17+ tocando juntos, mobile e laptops
// modestos engasgam. Os que não couberem viram snapshot estático.
const MAX_LIVE_VIDEOS = 6;

const HEIC_EXTENSIONS = ['heic', 'heif'];

const textureLoader = new THREE.TextureLoader();

let liveVideoCount = 0;

function getExtension(name) {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
}

export function isHeic(name) {
  return HEIC_EXTENSIONS.includes(getExtension(name));
}

function classify(source) {
  // source pode ser uma URL string ou um File.
  const name = source instanceof File ? source.name : source;
  const ext = getExtension(name);
  const videoExts = ['mp4', 'mov', 'm4v', 'webm'];
  if (videoExts.includes(ext)) return 'video';
  if (source instanceof File && source.type.startsWith('video/')) return 'video';
  return 'image';
}

function downscaleImage(image) {
  const { width, height } = image;
  const longest = Math.max(width, height);
  if (longest <= MAX_IMAGE_DIMENSION) {
    return image;
  }
  const scale = MAX_IMAGE_DIMENSION / longest;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, targetW, targetH);
  return canvas;
}

function loadImageTexture(url) {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        const source = texture.image;
        if (!source) {
          reject(new Error('image source missing'));
          return;
        }
        const downscaled = downscaleImage(source);
        if (downscaled !== source) {
          // Substitui a image da textura pela versão reduzida.
          texture.image = downscaled;
          texture.needsUpdate = true;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        // Mipmaps + trilinear suaviza a partícula quando vista de longe.
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        const aspect = source.width / source.height;
        resolve({ texture, aspect, isVideo: false, sourceUrl: url });
      },
      undefined,
      (err) => reject(err)
    );
  });
}

function loadVideoLive(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    // Set every attribute BEFORE src — assigning crossOrigin (or playsInline)
    // after src kicks off a reload that fails for blob: URLs.
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.src = url;

    const onLoaded = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
      const aspect = video.videoWidth / video.videoHeight;
      const texture = new THREE.VideoTexture(video);
      // Importante: VideoTexture com SRGBColorSpace tem bug em alguns browsers/drivers
      // — o frame não é convertido pelo GPU, mas o shader assume que já tá em linear.
      // Resultado é o vídeo aparecer "clareado/embranquecido". Marcando como NoColorSpace
      // os valores passam crus, e o shader pula o encoding final via uIsVideo flag.
      texture.colorSpace = THREE.NoColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      // Tenta tocar (alguns browsers bloqueiam autoplay até user gesture, mas com muted geralmente passa).
      video.play().catch(() => {});
      liveVideoCount += 1;
      resolve({ texture, aspect, isVideo: true, sourceUrl: url, video });
    };

    const onError = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
      reject(new Error(`failed to load video: ${url}`));
    };

    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onError);
  });
}

function snapshotVideoFrame(url) {
  // Carrega vídeo só pra capturar 1 frame e descartar (libera o decoder).
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    const onLoaded = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
      const w = video.videoWidth;
      const h = video.videoHeight;
      const longest = Math.max(w, h);
      const scale = longest > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longest : 1;
      const tw = Math.round(w * scale);
      const th = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, tw, th);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      // Pausa e libera (não é mais necessário).
      video.pause();
      video.removeAttribute('src');
      video.load();
      resolve({ texture, aspect: w / h, isVideo: false, sourceUrl: url });
    };

    const onError = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
      reject(new Error(`failed to snapshot video: ${url}`));
    };

    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onError);
  });
}

async function loadVideoTexture(url) {
  // Cap de vídeos vivos: além do limite, salva apenas snapshot estático.
  if (liveVideoCount < MAX_LIVE_VIDEOS) {
    try {
      return await loadVideoLive(url);
    } catch (err) {
      console.warn('[MediaLoader] failed live video, falling back to snapshot:', err);
      return snapshotVideoFrame(url);
    }
  }
  return snapshotVideoFrame(url);
}

export async function loadFromUrl(url, type) {
  // type ('image' | 'video') is authoritative; classify() falls back to
  // extension detection, which fails on blob: URLs.
  const kind = type || classify(url);
  const result = kind === 'video' ? await loadVideoTexture(url) : await loadImageTexture(url);
  // sourceType records the original media type even when a video was
  // downgraded to a snapshot (isVideo === false). Animations uses this to
  // know which snapshot videos can be promoted back to live on focus.
  result.sourceType = kind;
  return result;
}

// Carrega um vídeo ao vivo sob demanda — usado pelo focus pra promover
// snapshot estático em playback real. Não conta no liveVideoCount global
// porque só uma partícula fica focada por vez.
export function loadFocusVideoTexture(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.src = url;

    const onLoaded = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.NoColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      resolve({ texture, video });
    };
    const onError = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
      reject(new Error(`focus video failed: ${url}`));
    };
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onError);
  });
}

// Carrega a textura na resolução nativa (sem downscale) — usado pelo LOD quando uma
// partícula entra em foco. Mais nítido na aproximação. Mais memória, mas só uma por vez.
export function loadHighResImageTexture(url) {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        resolve(texture);
      },
      undefined,
      (err) => reject(err)
    );
  });
}

export async function loadFromFile(file) {
  if (isHeic(file.name)) {
    throw new Error('HEIC');
  }
  const url = URL.createObjectURL(file);
  // Decide por MIME pra evitar caso File sem extensão.
  const isVideo = file.type.startsWith('video/') || classify(file) === 'video';
  if (isVideo) return loadVideoTexture(url);
  return loadImageTexture(url);
}

export async function loadManifest(manifest) {
  const results = await Promise.allSettled(
    manifest.map((entry) => loadFromUrl(entry.path, entry.type))
  );
  const items = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      items.push(r.value);
    } else {
      console.warn(`[MediaLoader] failed to load ${manifest[i].path}:`, r.reason);
    }
  });
  return { items };
}

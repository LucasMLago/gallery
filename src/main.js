import { SceneManager } from './scene/SceneManager.js';
import { ParticleUniverse } from './scene/ParticleUniverse.js';
import { loadManifest } from './media/MediaLoader.js';
import { buildManifest } from './media/manifest.js';
import { PointerHandler } from './interaction/PointerHandler.js';
import { Animations } from './interaction/Animations.js';
import { readHexFromUrl, unlock } from './access/decrypt.js';
import { installProtections } from './access/protection.js';
import { render404 } from './access/notfound.js';

async function main() {
  installProtections();

  const hex = readHexFromUrl();
  const unlocked = hex ? await unlock(hex) : null;
  if (!unlocked) {
    render404();
    return;
  }

  const root = document.getElementById('app');
  const sceneManager = new SceneManager(root);

  const universe = new ParticleUniverse();
  sceneManager.add(universe.group);

  const animations = new Animations({
    camera: sceneManager.camera,
    controls: sceneManager.controls,
    universeGroup: universe.group,
  });

  const pointer = new PointerHandler({
    domElement: sceneManager.domElement,
    camera: sceneManager.camera,
    getMeshes: () => universe.getMeshes(),
  });

  pointer.onHoverChange(({ previous, current }) => {
    animations.hoverParticle(previous, current);
  });

  pointer.onClick((mesh) => {
    if (mesh) {
      animations.focusOn(mesh);
    } else if (animations.focused) {
      animations.releaseFocus();
    }
  });

  pointer.onInput(() => animations.registerInputForIdle());

  const manifestEntries = await buildManifest(unlocked);

  let mediaPool;
  try {
    mediaPool = await loadManifest(manifestEntries);
  } catch (err) {
    console.error('[main] failed to load manifest', err);
    mediaPool = { items: [] };
  }

  universe.spawn(mediaPool);

  // Universe is ready — switch the page background so the textured planes
  // read against the original light backdrop.
  document.body.style.background = '#ffffff';

  // Por frame: esconde partículas longe / fora do frustum, pausa seus vídeos
  // e aplica o drift idle (cachoeira contínua quando ninguém interage).
  let _lastTickMs = performance.now();
  sceneManager.onTick(() => {
    const now = performance.now();
    const dt = (now - _lastTickMs) / 1000;
    _lastTickMs = now;
    universe.cull(sceneManager.camera, animations.focused);
    animations.tickIdleDrift(sceneManager.camera, dt);
  });

  sceneManager.start();
  requestAnimationFrame(() => {
    if (universe.particles.length > 0) {
      animations.playIntro(universe.particles);
    }
    animations.registerInputForIdle();
  });
}

main().catch((err) => {
  console.error('[main] fatal error', err);
});

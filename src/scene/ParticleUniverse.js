import * as THREE from 'three';
import { createParticleMesh } from '../particles/ParticleMesh.js';

const SPATIAL_HALF = 18;        // cubo expandido pra acomodar separação mínima
const MIN_RADIUS = 4;           // distância mínima da origem (evita amontoado central)
const MIN_PARTICLE_DIST = 5.5;  // separação mínima entre dois centros (>= uMaxSize)
const PLACEMENT_RETRIES = 400;
const MAX_VISIBLE = 20;         // máximo de partículas renderizadas por frame (cull pelas mais distantes)

const _matrix = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();
// Buffer reusado pelo cull pra evitar alocação de array a cada frame.
const _cullBuffer = [];

function randomPointInShell() {
  for (let i = 0; i < 16; i++) {
    const x = (Math.random() * 2 - 1) * SPATIAL_HALF;
    const y = (Math.random() * 2 - 1) * SPATIAL_HALF;
    const z = (Math.random() * 2 - 1) * SPATIAL_HALF;
    if (Math.hypot(x, y, z) >= MIN_RADIUS) {
      return new THREE.Vector3(x, y, z);
    }
  }
  const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  return dir.multiplyScalar(MIN_RADIUS + Math.random() * (SPATIAL_HALF - MIN_RADIUS));
}

// Acha uma posição que não fique perto demais de nenhuma das já ocupadas.
function findNonOverlappingPosition(existing) {
  const minDistSq = MIN_PARTICLE_DIST * MIN_PARTICLE_DIST;
  let bestCandidate = null;
  let bestMinDistSq = -1;
  for (let attempt = 0; attempt < PLACEMENT_RETRIES; attempt++) {
    const candidate = randomPointInShell();
    let closestDistSq = Infinity;
    for (const e of existing) {
      const d = candidate.distanceToSquared(e);
      if (d < closestDistSq) closestDistSq = d;
    }
    if (closestDistSq >= minDistSq) return candidate;
    // Memoriza o candidato com maior gap pra usar como fallback.
    if (closestDistSq > bestMinDistSq) {
      bestMinDistSq = closestDistSq;
      bestCandidate = candidate;
    }
  }
  // Fallback: retorna o melhor que achou (mais espaçoso possível).
  return bestCandidate;
}

export class ParticleUniverse {
  constructor() {
    this.group = new THREE.Group();
    this.particles = []; // Array<{ mesh, targetPos, item }>
  }

  // Spawna uma partícula por mídia — cada textura é única, sem repetições.
  spawn(mediaPool) {
    const items = mediaPool.items;
    if (items.length === 0) {
      console.warn('[ParticleUniverse] empty media pool, no particles spawned');
      return;
    }
    const placed = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const mesh = createParticleMesh({ texture: item.texture, aspect: item.aspect, isVideo: item.isVideo });
      const targetPos = findNonOverlappingPosition(placed);
      placed.push(targetPos);
      mesh.position.set(0, 0, 0);
      mesh.userData.targetPos = targetPos;
      mesh.userData.item = item;       // pra LOD/animações poderem trocar texturas
      this.group.add(mesh);
      this.particles.push({ mesh, targetPos, item });
    }
  }

  getMeshes() {
    return this.particles.map((p) => p.mesh);
  }

  // Esconde partículas longe da câmera ou fora do frustum, e pausa os vídeos delas.
  // Chamado por frame; reusa _cullBuffer e flags em p pra evitar alocações.
  cull(camera, alwaysVisibleMesh = null) {
    _matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_matrix);

    const cameraPos = camera.position;
    const buf = _cullBuffer;
    buf.length = 0;

    // Calcula distância/frustum e empurra os in-frustum num buffer reusado.
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.mesh.getWorldPosition(_sphere.center);
      const dist = _sphere.center.distanceTo(cameraPos);

      // Raio visível matching o shader (uBaseSize / sqrt(distance), clamped).
      const u = p.mesh.material.uniforms;
      let scale = u.uBaseSize.value / Math.sqrt(Math.max(dist, 0.1));
      scale = Math.max(u.uMinSize.value, Math.min(u.uMaxSize.value, scale));
      _sphere.radius = scale * 0.5;

      p._distance = dist;
      p._shouldShow = false;
      if (_frustum.intersectsSphere(_sphere)) buf.push(p);
    }

    // Sort in place + marca top-K como visíveis.
    buf.sort((a, b) => a._distance - b._distance);
    const limit = Math.min(MAX_VISIBLE, buf.length);
    for (let i = 0; i < limit; i++) buf[i]._shouldShow = true;

    // Aplica visibilidade. Partícula em foco nunca esconde.
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      let shouldShow = p._shouldShow;
      if (alwaysVisibleMesh && p.mesh === alwaysVisibleMesh) shouldShow = true;

      if (p.mesh.visible !== shouldShow) {
        p.mesh.visible = shouldShow;
        const video = p.item.video;
        if (video) {
          if (shouldShow) video.play().catch(() => {});
          else video.pause();
        }
      }
    }
  }
}

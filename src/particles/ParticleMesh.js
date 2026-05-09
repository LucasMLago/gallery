import * as THREE from 'three';
import vertexShader from './shaders/particle.vert';
import fragmentShader from './shaders/particle.frag';

const SHARED_GEOMETRY = new THREE.PlaneGeometry(1, 1);

// Reusados pra evitar alocação por raycast.
const _worldPos = new THREE.Vector3();
const _closestPt = new THREE.Vector3();

// Custom raycast: a partícula é renderizada como billboard via shader, então a
// PlaneGeometry estática não corresponde ao que aparece na tela. Em vez de testar
// contra o triangle mesh, testamos contra uma esfera centrada em worldPos com
// raio = metade da escala visível (mesma fórmula do vertex shader).
function billboardRaycast(raycaster, intersects) {
  this.getWorldPosition(_worldPos);

  const u = this.material.uniforms;
  const distFromCamera = _worldPos.distanceTo(raycaster.ray.origin);
  let scale = u.uBaseSize.value / Math.sqrt(Math.max(distFromCamera, 0.1));
  scale = Math.max(u.uMinSize.value, Math.min(u.uMaxSize.value, scale)) * u.uHoverScale.value;
  const radius = scale * 0.5;

  raycaster.ray.closestPointToPoint(_worldPos, _closestPt);
  const offDist = _closestPt.distanceTo(_worldPos);

  if (offDist > radius) return;

  intersects.push({
    distance: distFromCamera,
    point: _closestPt.clone(),
    object: this,
  });
}

export function createParticleMesh({ texture, aspect, isVideo = false }) {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTexture: { value: texture },
      uTextureAspect: { value: aspect },
      uBaseSize: { value: 8.0 },
      uMinSize: { value: 0.4 },
      uMaxSize: { value: 5.0 },
      uHoverScale: { value: 1.0 },
      uOpacity: { value: 0.0 },
      uIsVideo: { value: isVideo ? 1.0 : 0.0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(SHARED_GEOMETRY, material);
  mesh.frustumCulled = false;
  mesh.raycast = billboardRaycast;
  return mesh;
}

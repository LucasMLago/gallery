uniform float uBaseSize;
uniform float uMinSize;
uniform float uMaxSize;
uniform float uHoverScale;
uniform float uOpacity;

varying vec2 vUv;
varying float vOpacity;

void main() {
  // Centro da partícula em view space (origem do mesh local, transformada por modelView)
  vec4 centerView = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);

  // Distância da câmera (em view space, frente é -Z)
  float distance = max(-centerView.z, 0.1);

  // Scale ∝ 1 / sqrt(distance) — perspectiva enfatizada mas suave.
  // Próximas crescem dramaticamente, distantes encolhem rápido mas sem virar pixel.
  float scale = uBaseSize / sqrt(distance);
  scale = clamp(scale, uMinSize, uMaxSize) * uHoverScale;

  // Constrói o quad em view space (sempre encarando a câmera — billboard).
  // position é (-0.5..0.5, -0.5..0.5, 0) do PlaneGeometry(1,1).
  vec2 offset = position.xy * scale;
  centerView.xy += offset;

  gl_Position = projectionMatrix * centerView;

  vUv = uv;
  vOpacity = uOpacity;
}

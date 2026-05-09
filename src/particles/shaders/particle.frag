precision highp float;

uniform sampler2D uTexture;
uniform float uTextureAspect; // width / height
uniform float uIsVideo;       // 1.0 = pula encoding sRGB no fim (vídeo já vem em sRGB cru)

varying vec2 vUv;
varying float vOpacity;

void main() {
  vec2 uv = vUv;

  // Quad é 1:1; ajusta UV pra preservar aspect ratio com letterbox.
  if (uTextureAspect > 1.0) {
    // Textura mais larga que alta: barras top/bottom.
    uv.y = (uv.y - 0.5) * uTextureAspect + 0.5;
    if (uv.y < 0.0 || uv.y > 1.0) {
      // Letterbox transparente em vez de preto pra não criar caixinha.
      discard;
    }
  } else {
    // Textura mais alta que larga: barras left/right.
    uv.x = (uv.x - 0.5) / uTextureAspect + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0) {
      discard;
    }
  }

  vec4 color = texture2D(uTexture, uv);
  gl_FragColor = vec4(color.rgb, color.a * vOpacity);

  // Pra IMAGENS (texture.colorSpace = SRGB): GPU faz sRGB→Linear ao sampleiar,
  // shader recebe valores LINEAR, e precisamos encodar pra sRGB no output.
  //
  // Pra VÍDEOS (texture.colorSpace = NoColorSpace): GPU não converte; sample retorna
  // valores sRGB-encoded crus do frame BT.709. Já estão prontos pro display, então
  // re-encodar causaria "embranquecimento" (double encode). Pulamos esse caso.
  if (uIsVideo < 0.5) {
    #include <colorspace_fragment>
  }
}

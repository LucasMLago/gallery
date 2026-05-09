import * as THREE from 'three';
import { gsap } from 'gsap';
import { loadHighResImageTexture, loadFocusVideoTexture } from '../media/MediaLoader.js';

const IDLE_MS = 5000;
const DRIFT_RAD_PER_SEC = (Math.PI * 2) / 60;  // 1 volta a cada 60s — mesma cadência do drift antigo
const INTRO_FALL_OFFSET = 30;                   // unidades acima da posição final no início

// Reusados pra zero alocação no tick.
const _camRight = new THREE.Vector3();

// Carrega a melhor qualidade disponível pra uma mídia em foco.
//   - imagem: textura nativa (até 1600px) em vez do downscale de 512px
//   - vídeo já ao vivo: nada a fazer (já tá no melhor)
//   - vídeo que virou snapshot estático: promove pra <video> de verdade
// O resultado é cacheado no item pra refoco ser instantâneo.
function ensureFocusedQuality(item) {
  if (item.sourceType === 'image' || (!item.isVideo && item.sourceType !== 'video')) {
    if (item._highResTexture) return Promise.resolve({ texture: item._highResTexture, kind: 'image' });
    if (item._highResLoading) return item._highResLoading;
    item._highResLoading = loadHighResImageTexture(item.sourceUrl)
      .then((tex) => {
        item._highResTexture = tex;
        return { texture: tex, kind: 'image' };
      })
      .catch((err) => {
        console.warn('[Animations] high-res image failed', err);
        return null;
      })
      .finally(() => {
        item._highResLoading = null;
      });
    return item._highResLoading;
  }
  // Vídeo já está ao vivo (item.video existe + isVideo true) — nada a fazer.
  if (item.isVideo) return Promise.resolve(null);
  // Snapshot de vídeo — promove pra ao vivo.
  if (item._focusLive) {
    item._focusLive.video.play().catch(() => {});
    return Promise.resolve({ texture: item._focusLive.texture, kind: 'video' });
  }
  if (item._focusLoading) return item._focusLoading;
  item._focusLoading = loadFocusVideoTexture(item.sourceUrl)
    .then((data) => {
      item._focusLive = data;
      data.video.play().catch(() => {});
      return { texture: data.texture, kind: 'video' };
    })
    .catch((err) => {
      console.warn('[Animations] focus video promotion failed', err);
      return null;
    })
    .finally(() => {
      item._focusLoading = null;
    });
  return item._focusLoading;
}

export class Animations {
  constructor({ camera, controls, universeGroup }) {
    this.camera = camera;
    this.controls = controls;
    this.universeGroup = universeGroup;

    this.focused = null;
    this._driftActive = false;
    this._idleTimer = null;
    this._initialCameraPos = camera.position.clone();
    this._initialTarget = controls.target.clone();
    this._preFocusCameraPos = null;
    this._preFocusTarget = null;
  }

  playIntro(particles) {
    // Cachoeira: cada partícula começa acima da sua posição final (no +Y do
    // mundo, que coincide com "topo da tela" na orientação inicial da câmera)
    // e desce só na vertical até pousar no destino. Delay escalonado por
    // distância vertical pra criar a sensação de fluxo contínuo, não batch.
    const tl = gsap.timeline();
    // Ordena por Y desc → particulas mais baixas começam a cair primeiro,
    // criando uma onda de cima pra baixo em vez de chuva uniforme.
    const sorted = [...particles].sort((a, b) => b.targetPos.y - a.targetPos.y);
    sorted.forEach((p, i) => {
      p.mesh.position.set(p.targetPos.x, p.targetPos.y + INTRO_FALL_OFFSET, p.targetPos.z);
      const delay = i * 0.025;
      tl.to(
        p.mesh.position,
        {
          y: p.targetPos.y,
          duration: 1.4,
          ease: 'power2.out',
        },
        delay
      );
      tl.to(
        p.mesh.material.uniforms.uOpacity,
        { value: 1.0, duration: 0.5, ease: 'power1.out' },
        delay
      );
    });
    return tl;
  }

  hoverParticle(prev, current) {
    if (prev) {
      gsap.to(prev.material.uniforms.uHoverScale, {
        value: 1.0,
        duration: 0.25,
        ease: 'power2.out',
      });
    }
    if (current) {
      gsap.to(current.material.uniforms.uHoverScale, {
        value: 1.3,
        duration: 0.25,
        ease: 'power2.out',
      });
    }
  }

  focusOn(particle) {
    // Toggle: clicar de novo na mesma partícula focada → solta foco e volta pro lugar de antes.
    if (this.focused === particle) {
      this.releaseFocus();
      return;
    }

    // Salva a câmera/target pré-foco apenas no primeiro clique da sequência.
    // Re-focar pra outra partícula sem soltar mantém o "ponto de retorno" original.
    if (!this.focused) {
      this._preFocusCameraPos = this.camera.position.clone();
      this._preFocusTarget = this.controls.target.clone();
    } else {
      // Trocou de foco sem soltar: pausa o vídeo promovido da partícula anterior
      // pra liberar decoder e restaura a textura original dela.
      this._restoreParticleTexture(this.focused);
    }

    this.focused = particle;

    // Pega a posição NO MUNDO da partícula (considera rotação do universeGroup pelo idle drift).
    // Antes estávamos usando particle.position que é LOCAL → câmera ia pro lugar antigo.
    const target = new THREE.Vector3();
    particle.getWorldPosition(target);
    const focusDistance = 4.5;

    // Mantém a direção atual de visualização: vai pra partícula a partir do mesmo ângulo
    // que o usuário já estava olhando, em vez de teleportar pro lado oposto à origem.
    const currentOffset = this.camera.position.clone().sub(this.controls.target);
    const dir = currentOffset.lengthSq() > 0.0001
      ? currentOffset.normalize()
      : new THREE.Vector3(0, 0, 1);
    const cameraTarget = target.clone().add(dir.multiplyScalar(focusDistance));

    gsap.to(this.camera.position, {
      x: cameraTarget.x,
      y: cameraTarget.y,
      z: cameraTarget.z,
      duration: 1.2,
      ease: 'power3.inOut',
      overwrite: 'auto',
    });
    gsap.to(this.controls.target, {
      x: target.x,
      y: target.y,
      z: target.z,
      duration: 1.2,
      ease: 'power3.inOut',
      overwrite: 'auto',
      onUpdate: () => this.controls.update(),
    });

    // Carrega/promove a melhor qualidade e aplica quando ficar pronta.
    const item = particle.userData.item;
    if (item) {
      ensureFocusedQuality(item).then((result) => {
        if (!result || this.focused !== particle) return;
        particle.material.uniforms.uTexture.value = result.texture;
        if (result.kind === 'video') {
          particle.material.uniforms.uIsVideo.value = 1.0;
        }
      });
    }
  }

  // Volta a textura da partícula pro estado pré-foco e pausa qualquer
  // vídeo promovido. Cache do _focusLive é mantido pra refoco rápido.
  _restoreParticleTexture(particle) {
    const item = particle.userData.item;
    if (!item) return;
    if (item.texture) {
      particle.material.uniforms.uTexture.value = item.texture;
    }
    particle.material.uniforms.uIsVideo.value = item.isVideo ? 1.0 : 0.0;
    if (item._focusLive?.video) {
      item._focusLive.video.pause();
    }
  }

  releaseFocus() {
    if (!this.focused) return;
    const previouslyFocused = this.focused;
    this.focused = null;

    this._restoreParticleTexture(previouslyFocused);

    // Restaura o estado salvo no primeiro foco; fallback pro estado inicial só por segurança.
    const camDest = this._preFocusCameraPos || this._initialCameraPos;
    const tgtDest = this._preFocusTarget || this._initialTarget;

    gsap.to(this.camera.position, {
      x: camDest.x,
      y: camDest.y,
      z: camDest.z,
      duration: 1.0,
      ease: 'power2.inOut',
      overwrite: 'auto',
    });
    gsap.to(this.controls.target, {
      x: tgtDest.x,
      y: tgtDest.y,
      z: tgtDest.z,
      duration: 1.0,
      ease: 'power2.inOut',
      overwrite: 'auto',
      onUpdate: () => this.controls.update(),
    });

    this._preFocusCameraPos = null;
    this._preFocusTarget = null;
  }

  registerInputForIdle() {
    this._resetIdleTimer();
  }

  _resetIdleTimer() {
    this.stopIdleDrift();
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => this.startIdleDrift(), IDLE_MS);
  }

  startIdleDrift() {
    // Não rotaciona o universo enquanto o usuário tá focado em uma mídia —
    // se rotacionasse, a partícula focada sairia de vista.
    if (this.focused) return;
    this._driftActive = true;
  }

  stopIdleDrift() {
    this._driftActive = false;
  }

  // Chamado por frame pelo loop principal. Roda o universo em volta do
  // eixo "right" da câmera (extraído da matrixWorld), de modo que as
  // partículas aparecem caindo de cima pra baixo na tela mesmo se o usuário
  // já tiver virado a câmera pra outra orientação.
  tickIdleDrift(camera, deltaSeconds) {
    if (!this._driftActive || this.focused) return;
    _camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.universeGroup.rotateOnWorldAxis(_camRight, DRIFT_RAD_PER_SEC * deltaSeconds);
  }
}

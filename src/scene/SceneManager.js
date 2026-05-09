import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';

// Pixel ratio durante interação ativa (drag/zoom): a câmera tá se mexendo,
// motion blur do olho mascara perda de nitidez, e cair de 1.5 → 0.75 corta
// ~75% do trabalho de fragment shader. Volta pra HIGH só depois que o
// movimento da câmera realmente para — incluindo o fling do damping pós-drag.
const PIXEL_RATIO_HIGH = 1.5;
const PIXEL_RATIO_INTERACTIVE = 0.75;
// Frames de câmera estática antes de voltar pra HIGH. ~4 frames @ 60fps =
// 67ms; suficiente pra confirmar que o damping decaiu e evita flicker.
const STABLE_FRAMES_BEFORE_RESTORE = 4;

export class SceneManager {
  constructor(rootEl) {
    this.rootEl = rootEl;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      // Hint pro browser usar a GPU dedicada quando há uma; em laptops com
      // dGPU isso troca a Intel iGPU pela Nvidia/AMD e dá render bem mais fluido.
      powerPreference: 'high-performance',
    });
    this._highRatio = Math.min(window.devicePixelRatio, PIXEL_RATIO_HIGH);
    this._lowRatio = Math.min(window.devicePixelRatio, PIXEL_RATIO_INTERACTIVE);
    this.renderer.setPixelRatio(this._highRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0); // transparente; CSS dá o gradiente
    rootEl.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    this.camera.position.set(0, 0, 30);
    this.camera.lookAt(0, 0, 0);

    // TrackballControls em vez de OrbitControls: permite rotação 360° livre
    // em qualquer eixo (inclusive flip vertical), sem o gimbal lock que o
    // OrbitControls impõe via Spherical.makeSafe().
    this.controls = new TrackballControls(this.camera, this.renderer.domElement);
    this.controls.staticMoving = false;
    this.controls.dynamicDampingFactor = 0.15;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 80;
    this.controls.rotateSpeed = 2.5;
    this.controls.zoomSpeed = 1.0;
    this.controls.panSpeed = 0.6;

    this._tickListeners = [];
    this._handleResize = this._handleResize.bind(this);
    window.addEventListener('resize', this._handleResize);

    // Estado pra detecção de movimento da câmera frame a frame.
    this._prevCamPos = new THREE.Vector3();
    this._prevCamQuat = new THREE.Quaternion();
    this._stableFrames = STABLE_FRAMES_BEFORE_RESTORE;

    // Pointer down / wheel cai pra LOW imediatamente — feedback instantâneo
    // sem esperar o detector de movimento ler o primeiro delta.
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', () => this._setInteractive(true));
    canvas.addEventListener('wheel', () => this._setInteractive(true), { passive: true });
    // 'change' é despachado pelo TrackballControls toda vez que update() move
    // a câmera além do epsilon interno — drag, zoom (wheel ou pinch), pan,
    // e cada frame de damping. Mais confiável que escutar wheel direto, já
    // que cobre gesture events de trackpad/touch também.
    this.controls.addEventListener('change', () => this._setInteractive(true));
  }

  _setInteractive(isInteractive) {
    if (isInteractive) this._stableFrames = 0;
    const target = isInteractive ? this._lowRatio : this._highRatio;
    if (this.renderer.getPixelRatio() === target) return;
    this.renderer.setPixelRatio(target);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  add(object3d) {
    this.scene.add(object3d);
  }

  onTick(fn) {
    this._tickListeners.push(fn);
  }

  start() {
    const loop = () => {
      this._frame = requestAnimationFrame(loop);
      this.controls.update();

      // Quem dita o pixel ratio é o movimento real da câmera. Se ainda
      // mexeu nesse frame (drag, fling do damping, GSAP de focus), continua
      // LOW. Estável por N frames seguidos → restaura HIGH.
      const moved =
        !this._prevCamPos.equals(this.camera.position) ||
        !this._prevCamQuat.equals(this.camera.quaternion);
      this._prevCamPos.copy(this.camera.position);
      this._prevCamQuat.copy(this.camera.quaternion);

      if (moved) {
        this._setInteractive(true);
      } else if (this._stableFrames < STABLE_FRAMES_BEFORE_RESTORE) {
        this._stableFrames++;
        if (this._stableFrames >= STABLE_FRAMES_BEFORE_RESTORE) {
          this._setInteractive(false);
        }
      }

      for (const fn of this._tickListeners) fn();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  _handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    // TrackballControls cacheia tamanho da tela pra mapear delta do mouse.
    this.controls.handleResize();
  }

  get domElement() {
    return this.renderer.domElement;
  }
}

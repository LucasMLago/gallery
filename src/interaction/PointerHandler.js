import * as THREE from 'three';

export class PointerHandler {
  constructor({ domElement, camera, getMeshes }) {
    this.domElement = domElement;
    this.camera = camera;
    this.getMeshes = getMeshes;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.currentHover = null;
    this._hoverListeners = [];
    this._clickListeners = [];
    this._inputListeners = [];

    this._pointerDown = false;
    this._downX = 0;
    this._downY = 0;
    // Throttle hover raycasts to one per animation frame. Pointermove can
    // fire 100+/sec; doing 97 sphere tests + GSAP tweens at that rate is the
    // main source of interaction stutter on weaker hardware.
    this._rafScheduled = false;
    this._lastEvent = null;

    this._onMove = this._onMove.bind(this);
    this._onDown = this._onDown.bind(this);
    this._onUp = this._onUp.bind(this);
    this._tickHover = this._tickHover.bind(this);

    domElement.addEventListener('pointermove', this._onMove);
    domElement.addEventListener('pointerdown', this._onDown);
    domElement.addEventListener('pointerup', this._onUp);
    domElement.addEventListener('wheel', () => this._fireInput(), { passive: true });
  }

  onHoverChange(fn) { this._hoverListeners.push(fn); }
  onClick(fn) { this._clickListeners.push(fn); }
  onInput(fn) { this._inputListeners.push(fn); }

  _fireInput() {
    for (const fn of this._inputListeners) fn();
  }

  _updatePointer(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _intersect() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Only test visible meshes — the cull already hides ~60% of particles
    // every frame, so this avoids ~60 cheap-but-needless sphere tests.
    const meshes = this.getMeshes();
    const visible = [];
    for (const m of meshes) if (m.visible) visible.push(m);
    const hits = this.raycaster.intersectObjects(visible, false);
    return hits.length ? hits[0].object : null;
  }

  _onMove(event) {
    this._fireInput();
    this._lastEvent = event;
    // Don't raycast during a drag — TrackballControls is rotating the camera
    // and hover state is not meaningful. Saves the most expensive per-move
    // work in the app.
    if (this._pointerDown) return;
    if (this._rafScheduled) return;
    this._rafScheduled = true;
    requestAnimationFrame(this._tickHover);
  }

  _tickHover() {
    this._rafScheduled = false;
    if (this._pointerDown || !this._lastEvent) return;
    this._updatePointer(this._lastEvent);
    const hit = this._intersect();
    if (hit !== this.currentHover) {
      const prev = this.currentHover;
      this.currentHover = hit;
      this.domElement.style.cursor = hit ? 'pointer' : 'default';
      for (const fn of this._hoverListeners) fn({ previous: prev, current: hit });
    }
  }

  _onDown(event) {
    this._fireInput();
    this._pointerDown = true;
    this._downX = event.clientX;
    this._downY = event.clientY;
    // Clear any stale hover so we don't keep a hovered particle highlighted
    // through the entire drag.
    if (this.currentHover) {
      const prev = this.currentHover;
      this.currentHover = null;
      this.domElement.style.cursor = 'default';
      for (const fn of this._hoverListeners) fn({ previous: prev, current: null });
    }
  }

  _onUp(event) {
    this._pointerDown = false;
    const dx = event.clientX - this._downX;
    const dy = event.clientY - this._downY;
    if (Math.hypot(dx, dy) > 4) {
      // Foi um drag, não um click.
      return;
    }
    this._updatePointer(event);
    const hit = this._intersect();
    for (const fn of this._clickListeners) fn(hit);
  }
}

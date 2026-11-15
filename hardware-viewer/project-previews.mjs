const profiles = {
  genumi: { name: 'InstaUMI', up: [0, .65, -1], direction: [1.2, 1, -.36] },
  aetherock: { name: 'AetheRock', up: [0, 1, 0], direction: [-1.4, .8, 1.18] },
  gelslim: { name: 'Gelslim Mini', up: [0, -1, 0], direction: [1, -1.18, -.86] },
};

async function showPreview(surface) {
  const {
    ACESFilmicToneMapping, Box3, DirectionalLight, GLTFLoader, HemisphereLight,
    PerspectiveCamera, Scene, Vector3, WebGLRenderer,
  } = await import('./vendor/three-cad.mjs');
  const { name, up, direction } = profiles[surface.dataset.projectPreview];
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', `${name} 3D preview. Use arrow keys to rotate or Home to reset.`);
  canvas.setAttribute('aria-describedby', `project-${surface.dataset.projectPreview}-controls`);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = surface.dataset.projectPreview === 'genumi' ? .82 : 1.18;
  const scene = new Scene();
  const camera = new PerspectiveCamera(36);
  camera.up.set(...up).normalize();
  const initialView = new Vector3(...direction).normalize();
  const view = initialView.clone();
  const resetButton = surface.querySelector('[data-preview-reset]');
  const spinButton = surface.querySelector('[data-preview-spin]');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const idleDelayMs = 2500;
  const spinRadiansPerSecond = .32;
  let autoRotate = !motionPreference.matches;
  let spinReady = false;
  let lastSpinTime = null;
  let visible = !('IntersectionObserver' in window);
  let resizeObserver, visibilityObserver, pointer, spinTimer;
  let renderFrame = 0;
  let distance;

  function restorePoster(event) {
    event?.preventDefault();
    cancelAnimationFrame(renderFrame);
    clearTimeout(spinTimer);
    resizeObserver?.disconnect();
    visibilityObserver?.disconnect();
    document.removeEventListener('visibilitychange', scheduleSpin);
    motionPreference.removeEventListener('change', updateMotionPreference);
    resetButton.removeEventListener('click', reset);
    spinButton.removeEventListener('click', toggleSpin);
    canvas.remove();
    renderer.dispose();
    surface.dataset.previewState = 'fallback';
  }

  let center, radius;
  try {
    const loader = new GLTFLoader();
    const paths = [surface.dataset.model, surface.dataset.accessories].filter(Boolean);
    for (const { scene: model } of await Promise.all(paths.map((url) => loader.loadAsync(url)))) {
      model.traverse((object) => {
        if (object.isLine || object.isPoints) object.visible = false;
        if (object.isMesh && !object.geometry.getAttribute('normal')) object.geometry.computeVertexNormals();
      });
      scene.add(model);
    }
    const bounds = new Box3();
    const corners = [];
    scene.updateMatrixWorld(true);
    scene.traverseVisible((object) => {
      if (!object.isMesh) return;
      object.geometry.computeBoundingBox();
      const { min, max } = object.geometry.boundingBox;
      for (const x of [min.x, max.x]) {
        for (const y of [min.y, max.y]) {
          for (const z of [min.z, max.z]) {
            const corner = new Vector3(x, y, z).applyMatrix4(object.matrixWorld);
            bounds.expandByPoint(corner);
            corners.push(corner);
          }
        }
      }
    });
    if (bounds.isEmpty()) throw new Error('Empty project preview');
    center = bounds.getCenter(new Vector3());
    radius = corners.reduce((largest, corner) => Math.max(largest, corner.distanceTo(center)), 0);
    if (!Number.isFinite(radius) || radius <= 0) throw new Error('Invalid preview bounds');
  } catch (error) {
    restorePoster();
    throw error;
  }

  scene.add(new HemisphereLight(0xffffff, 0x80796c, 2.35));
  for (const [position, intensity] of [
    [[1, 1.5, 1], 2.45], [[-1, .35, .7], 1.25], [[.1, 1, -1], 1.65], [[.8, -1.4, -.5], 1.45],
  ]) {
    const light = new DirectionalLight(0xffffff, intensity);
    light.position.set(...position);
    scene.add(light);
  }

  function scheduleSpin() {
    clearTimeout(spinTimer);
    spinReady = false;
    lastSpinTime = null;
    if (!autoRotate || !visible || document.hidden || pointer) return;
    spinTimer = setTimeout(() => {
      spinReady = true;
      requestDraw();
    }, idleDelayMs);
  }

  function setAutoRotate(enabled) {
    autoRotate = enabled;
    spinButton.textContent = enabled ? 'Pause' : 'Play';
    spinButton.setAttribute('aria-label', `${enabled ? 'Pause' : 'Play'} automatic rotation of ${name}`);
    scheduleSpin();
  }

  function toggleSpin() {
    setAutoRotate(!autoRotate);
  }

  function updateMotionPreference() {
    setAutoRotate(!motionPreference.matches);
  }

  function draw(now) {
    renderFrame = 0;
    if (spinReady) {
      if (lastSpinTime !== null) {
        const frameTime = now - lastSpinTime;
        if (frameTime < 30) {
          requestDraw();
          return;
        }
        const elapsed = Math.min(frameTime, 100) / 1000;
        view.applyAxisAngle(camera.up, spinRadiansPerSecond * elapsed);
      }
      lastSpinTime = now;
    }
    camera.position.copy(center).addScaledVector(view, distance);
    camera.lookAt(center);
    renderer.render(scene, camera);
    if (surface.dataset.previewState !== 'ready') surface.dataset.previewState = 'ready';
    if (spinReady) requestDraw();
  }

  function requestDraw() {
    if (!renderFrame && distance) renderFrame = requestAnimationFrame(draw);
  }

  function reset() {
    scheduleSpin();
    view.copy(initialView);
    requestDraw();
  }

  function rotate(dx, dy) {
    view.applyAxisAngle(camera.up, -dx);
    const right = new Vector3().crossVectors(camera.up, view).normalize();
    const inclination = view.angleTo(camera.up);
    const next = Math.max(.04, Math.min(Math.PI - .04, inclination + dy));
    view.applyAxisAngle(right, next - inclination);
    requestDraw();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (pointer || !event.isPrimary || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    scheduleSpin();
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-rotating');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (pointer?.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (!dx && !dy) return;
    const scale = Math.PI / Math.max(canvas.clientHeight, 1);
    rotate(dx * scale, dy * scale);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(event, ({ pointerId }) => {
      if (pointer?.id !== pointerId) return;
      pointer = null;
      canvas.classList.remove('is-rotating');
      scheduleSpin();
    });
  }
  canvas.addEventListener('keydown', (event) => {
    const movement = {
      ArrowLeft: [-.15, 0], ArrowRight: [.15, 0], ArrowUp: [0, -.15], ArrowDown: [0, .15],
    }[event.key];
    if (!movement && event.key !== 'Home') return;
    event.preventDefault();
    if (movement) {
      scheduleSpin();
      rotate(...movement);
    } else reset();
  });
  canvas.addEventListener('webglcontextlost', restorePoster);
  resetButton.addEventListener('click', reset);
  spinButton.addEventListener('click', toggleSpin);
  document.addEventListener('visibilitychange', scheduleSpin);
  motionPreference.addEventListener('change', updateMotionPreference);
  updateMotionPreference();
  if ('IntersectionObserver' in window) {
    visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.intersectionRatio >= .05;
      scheduleSpin();
    }, { threshold: .05 });
    visibilityObserver.observe(surface);
  }
  surface.append(canvas);
  resizeObserver = new ResizeObserver(() => {
    const { clientWidth: width, clientHeight: height } = surface;
    if (!width || !height) return;
    camera.aspect = width / height;
    const verticalHalfFov = camera.fov * Math.PI / 360;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
    // Keep the bounding sphere in view at every angle without zooming during a drag.
    distance = 1.035 * radius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov));
    camera.near = distance - radius * 1.05;
    camera.far = distance + radius * 1.05;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    requestDraw();
  });
  resizeObserver.observe(surface);
}

const previews = document.querySelectorAll('[data-project-preview]');
function loadPreview(preview) {
  showPreview(preview).catch(() => { preview.dataset.previewState = 'fallback'; });
}

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      observer.unobserve(target);
      loadPreview(target);
    }
  }, { rootMargin: '160px' });
  previews.forEach((preview) => observer.observe(preview));
} else {
  previews.forEach(loadPreview);
}

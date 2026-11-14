const profiles = {
  genumi: { name: 'GenUMI', up: [0, .65, -1], direction: [1.2, 1, -.36] },
  gelslim: { name: 'GelSlim Mini', up: [0, -1, 0], direction: [1, -1.18, -.86] },
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
  const view = new Vector3(...direction).normalize();
  const resetButton = surface.querySelector('[data-preview-reset]');
  let observer;

  function restorePoster(event) {
    event?.preventDefault();
    observer?.disconnect();
    resetButton.removeEventListener('click', reset);
    canvas.remove();
    renderer.dispose();
    surface.dataset.previewState = 'fallback';
  }

  let center, modelCorners;
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
    modelCorners = corners.map((corner) => corner.sub(center));
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

  function draw() {
    camera.lookAt(center);
    renderer.render(scene, camera);
  }

  function fit() {
    const right = new Vector3().crossVectors(camera.up, view).normalize();
    const vertical = new Vector3().crossVectors(view, right);
    const vSlope = Math.tan(camera.fov * Math.PI / 360);
    const hSlope = vSlope * camera.aspect;
    let distance = 0;
    for (const point of modelCorners) {
      distance = Math.max(distance, point.dot(view) + 1.14 * Math.max(
        Math.abs(point.dot(right)) / hSlope,
        Math.abs(point.dot(vertical)) / vSlope,
      ));
    }
    camera.position.copy(center).addScaledVector(view, distance);
    camera.near = distance / 150;
    camera.far = distance * 40;
    camera.updateProjectionMatrix();
    draw();
  }

  function reset() {
    view.set(...direction).normalize();
    fit();
  }

  function rotate(dx, dy) {
    view.applyAxisAngle(camera.up, -dx);
    const right = new Vector3().crossVectors(camera.up, view).normalize();
    const inclination = view.angleTo(camera.up);
    const next = Math.max(.04, Math.min(Math.PI - .04, inclination + dy));
    view.applyAxisAngle(right, next - inclination);
    fit();
  }

  let pointer;
  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, rotating: event.pointerType !== 'touch' };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (pointer?.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.rotating && (Math.abs(dx) < 6 || Math.abs(dx) <= Math.abs(dy))) return;
    pointer.rotating = true;
    const scale = 3.4 / canvas.clientHeight;
    rotate(dx * scale, dy * scale);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(event, () => { pointer = null; });
  }
  canvas.addEventListener('keydown', (event) => {
    const movement = {
      ArrowLeft: [-.15, 0], ArrowRight: [.15, 0], ArrowUp: [0, -.15], ArrowDown: [0, .15],
    }[event.key];
    if (!movement && event.key !== 'Home') return;
    event.preventDefault();
    if (movement) rotate(...movement);
    else reset();
  });
  canvas.addEventListener('webglcontextlost', restorePoster);
  resetButton.addEventListener('click', reset);
  surface.append(canvas);
  observer = new ResizeObserver(() => {
    if (!surface.clientWidth || !surface.clientHeight) return;
    camera.aspect = surface.clientWidth / surface.clientHeight;
    renderer.setSize(surface.clientWidth, surface.clientHeight, false);
    fit();
    surface.dataset.previewState = 'ready';
  });
  observer.observe(surface);
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

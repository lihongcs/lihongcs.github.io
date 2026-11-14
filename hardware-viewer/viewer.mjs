import {
  ACESFilmicToneMapping, Box3, Color, DirectionalLight, GLTFLoader,
  HemisphereLight, OrbitControls, PerspectiveCamera, Raycaster, Scene,
  Vector2, Vector3, WebGLRenderer,
} from './vendor/three-cad.mjs';

function labelFor(object) {
  const label = object.userData.label || object.name;
  return label.replace(/_/g, ' ').trim() || 'Unnamed part';
}

function isContext(object) {
  return Boolean(object.userData.context);
}

export async function mountViewer(root) {
  const surface = root.querySelector('[data-cad-surface]');
  const status = root.querySelector('[data-cad-status]');
  const selector = root.querySelector('[data-cad-parts]');
  const selectedName = root.querySelector('[data-cad-name]');
  const selectedModule = root.querySelector('[data-cad-module]');
  const contextToggle = root.querySelector('[data-cad-context]');
  const toolbar = root.querySelector('[data-cad-toolbar]');
  const scene = new Scene();
  scene.background = new Color(0xf2eee7);

  const camera = new PerspectiveCamera(38, 1, 0.01, 2000);
  if (root.dataset.cadView === 'contact') camera.up.set(0, -1, 0);
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D assembly. Use the controls or select a part from the list.');
  renderer.domElement.tabIndex = 0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  surface.append(renderer.domElement);

  const defaultUp = camera.up.clone();
  let controls = createOrbitControls();

  function createOrbitControls() {
    const controller = new OrbitControls(camera, renderer.domElement);
    controller.enableDamping = false;
    controller.enablePan = true;
    controller.addEventListener('change', render);
    return controller;
  }

  function setViewUp(up) {
    if (camera.up.equals(up)) return;
    controls.dispose();
    camera.up.copy(up);
    controls = createOrbitControls();
  }
  scene.add(new HemisphereLight(0xffffff, 0x80796c, 2.35));
  if (root.dataset.cadView === 'contact') {
    const contactLight = new DirectionalLight(0xe6f1ff, 1.45);
    contactLight.position.set(0.8, -1.4, -0.5);
    scene.add(contactLight);
  }
  for (const [position, intensity] of [
    [[1, 1.5, 1], 2.45], [[-1, 0.35, 0.7], 1.25], [[0.1, 1.0, -1], 1.65],
  ]) {
    const light = new DirectionalLight(0xffffff, intensity);
    light.position.set(...position);
    scene.add(light);
  }

  let model;
  let radius = 1;
  let selected = [];
  let solo = false;
  const groups = new Map();
  const meshes = [];
  const meshKeys = new Map();
  const accent = new Color(0xeea226);
  const box = new Box3();
  const pointer = new Vector2();
  const ray = new Raycaster();

  function render() {
    renderer.render(scene, camera);
  }

  function resize() {
    const { width, height } = surface.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  }

  function hasVisibleMesh(object) {
    if (!contextToggle || contextToggle.checked) return true;
    for (let parent = object; parent && parent !== model; parent = parent.parent) {
      if (isContext(parent)) return false;
    }
    return true;
  }

  function applySelection() {
    const highlighted = new Set(selected);
    for (const mesh of meshes) {
      const active = highlighted.has(mesh);
      mesh.visible = hasVisibleMesh(mesh) && (!solo || active || !highlighted.size);
      for (const [material, original] of mesh.userData.highlightMaterials) {
        if (!material.emissive || !original) continue;
        material.emissive.copy(active ? accent : original);
        material.emissiveIntensity = active ? 0.38 : material.userData.originalEmission;
      }
    }
    render();
  }

  function focus(objects, direction, fit = 1.18) {
    box.makeEmpty();
    for (const object of objects) box.expandByObject(object, true);
    fitBounds(box, direction, fit);
  }

  function fitBounds(box, direction, fit = 1.18) {
    if (box.isEmpty()) return;
    const center = box.getCenter(new Vector3());
    radius = Math.max(box.getSize(new Vector3()).length() / 2, 0.001);
    direction.normalize();
    const right = new Vector3().crossVectors(camera.up, direction).normalize();
    const up = new Vector3().crossVectors(direction, right).normalize();
    const vertical = Math.tan((camera.fov * Math.PI) / 360);
    const horizontal = vertical * camera.aspect;
    const offset = new Vector3();
    let distance = radius * 0.8;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          offset.set(x, y, z).sub(center);
          distance = Math.max(distance, offset.dot(direction) + fit *
            Math.max(Math.abs(offset.dot(right)) / horizontal, Math.abs(offset.dot(up)) / vertical));
        }
      }
    }
    camera.near = radius / 150;
    camera.far = Math.max(distance * 25, radius * 50);
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.target.copy(center);
    controls.minDistance = radius * 0.08;
    controls.maxDistance = distance * 8;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function viewpoint(key = 'iso') {
    setViewUp(defaultUp);
    const direction = {
      iso: root.dataset.cadView === 'contact'
        ? new Vector3(1, -1.18, -0.86)
        : new Vector3(-1.4, 0.8, 1.18),
      top: new Vector3(0, 1, 0.0001),
      side: new Vector3(-1, 0.08, 0),
      electronics: new Vector3(-1.0, 1.18, 1.02),
    }[key];
    const visible = meshes.filter((mesh) => mesh.visible);
    focus(visible, direction);
  }

  function gripView() {
    const triggerBounds = new Box3();
    for (const group of groups.values()) {
      if (!/^(Left|Right) Fingertip Support$/.test(group.label)) continue;
      for (const mesh of group.meshes) triggerBounds.expandByObject(mesh, true);
    }
    if (triggerBounds.isEmpty()) return;

    if (contextToggle && !contextToggle.checked) {
      contextToggle.checked = true;
      contextToggle.dispatchEvent(new Event('change'));
    }
    select('');

    // Include both trigger recesses and the palm on the operator side of the frame.
    const span = triggerBounds.getSize(new Vector3());
    triggerBounds.expandByVector(new Vector3(span.x * 0.15, 0, 0));
    triggerBounds.max.y -= span.y * 0.28;
    triggerBounds.min.y -= span.y * 0.10;
    triggerBounds.min.z -= span.z * 0.12;
    setViewUp(new Vector3(0, 0, -1));
    fitBounds(triggerBounds, new Vector3(-0.06, -1, 0.25), 1.08);
  }

  function select(key) {
    const group = groups.get(key);
    selected = group?.meshes || [];
    selector.value = group ? key : '';
    selectedName.textContent = group?.label || 'Full assembly';
    selectedModule.textContent = group?.module && group.module !== group.label ? group.module : '';
    for (const button of root.querySelectorAll('[data-cad-action="focus"], [data-cad-action="isolate"]')) {
      button.disabled = !group;
    }
    if (!group) solo = false;
    root.querySelector('[data-cad-action="isolate"]').setAttribute('aria-pressed', String(solo));
    applySelection();
    if (solo) focus(selected.filter((mesh) => mesh.visible), camera.position.clone().sub(controls.target));
  }

  function act(action) {
    if (action === 'isolate') {
      solo = !solo;
      root.querySelector('[data-cad-action="isolate"]').setAttribute('aria-pressed', String(solo));
      applySelection();
      if (solo) focus(selected.filter((mesh) => mesh.visible), camera.position.clone().sub(controls.target));
      else viewpoint();
    } else if (action === 'grip') {
      gripView();
    } else if (action === 'focus') {
      focus(selected.filter((mesh) => mesh.visible), camera.position.clone().sub(controls.target));
    } else if (action === 'reset') {
      solo = false;
      select('');
      viewpoint();
    } else if (action === 'zoom-in' || action === 'zoom-out') {
      const relative = camera.position.clone().sub(controls.target);
      const distance = relative.length() * (action === 'zoom-in' ? 0.8 : 1.25);
      camera.position.copy(controls.target).addScaledVector(relative.normalize(),
        Math.max(controls.minDistance, Math.min(controls.maxDistance, distance)));
      controls.update();
      render();
    } else {
      viewpoint(action);
    }
  }

  function trackMesh(object, key) {
    meshKeys.set(object, key);
    meshes.push(object);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const duplicates = materials.map((material) => {
      const copy = material.clone();
      copy.userData.originalEmission = copy.emissiveIntensity;
      return copy;
    });
    object.material = Array.isArray(object.material) ? duplicates : duplicates[0];
    object.userData.highlightMaterials = duplicates.map((material) => [material, material.emissive?.clone()]);
  }

  try {
    const loaded = await new GLTFLoader().loadAsync(root.dataset.model, (event) => {
      if (event.lengthComputable) {
        status.textContent = `Loading 3D model… ${Math.round(event.loaded * 100 / event.total)}%`;
      }
    });
    model = loaded.scene;
    scene.add(model);

    model.traverse((object) => {
      if (!object.isMesh || !object.geometry) return;
      const named = object.userData.label ? object
        : (object.parent?.userData.label ? object.parent : object);
      const label = labelFor(named);
      const module = named.userData.module || object.userData.module || '';
      const context = isContext(object) || isContext(named);
      if (context) object.userData.context = true;
      const key = JSON.stringify([module, label, context]);
      if (!groups.has(key)) groups.set(key, { label, module, context, meshes: [] });
      groups.get(key).meshes.push(object);
      trackMesh(object, key);
    });
    if (!meshes.length) throw new Error('The model has no visible parts.');

    const clustered = new Map();
    const sorted = [...groups.entries()].sort(([, a], [, b]) =>
      a.module.localeCompare(b.module) || a.label.localeCompare(b.label));
    for (const [key, group] of sorted) {
      const category = group.module || 'Parts';
      if (!clustered.has(category)) {
        const section = document.createElement('optgroup');
        section.label = category;
        clustered.set(category, section);
        selector.append(section);
      }
      const option = new Option(group.label, key);
      option.dataset.context = String(group.context);
      clustered.get(category).append(option);
    }

    if (contextToggle) {
      contextToggle.closest('label').hidden = !meshes.some((mesh) => !hasVisibleMesh(mesh)) &&
        !sorted.some(([, group]) => group.context);
      contextToggle.addEventListener('change', () => {
        if (!contextToggle.checked && groups.get(selector.value)?.context) select('');
        for (const option of selector.querySelectorAll('[data-context="true"]')) option.disabled = !contextToggle.checked;
        applySelection();
        viewpoint();
      });
      if (!contextToggle.checked) {
        for (const option of selector.querySelectorAll('[data-context="true"]')) option.disabled = true;
      }
    }
    applySelection();
    status.hidden = true;
    toolbar.hidden = false;
    root.dataset.cadReady = 'true';
    resize();
    viewpoint();
    new ResizeObserver(resize).observe(surface);

    selector.addEventListener('change', () => select(selector.value));
    toolbar.addEventListener('click', (event) => {
      const action = event.target.closest('[data-cad-action]')?.dataset.cadAction;
      if (action) act(action);
    });

    let start;
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', (event) => {
      if (event.isPrimary && event.button === 0) start = [event.clientX, event.clientY];
    });
    canvas.addEventListener('pointercancel', () => { start = undefined; });
    canvas.addEventListener('pointerup', (event) => {
      if (!start || !event.isPrimary || event.button !== 0) return;
      const moved = Math.hypot(event.clientX - start[0], event.clientY - start[1]);
      start = undefined;
      if (moved > 5) return;
      const bounds = canvas.getBoundingClientRect();
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1,
        -(event.clientY - bounds.top) / bounds.height * 2 + 1);
      ray.setFromCamera(pointer, camera);
      const hits = ray.intersectObjects(meshes.filter((mesh) => mesh.visible), false);
      const hit = hits.find((item) => !isContext(item.object)) || hits[0];
      if (hit) select(meshKeys.get(hit.object));
    });
    canvas.addEventListener('keydown', (event) => {
      const actions = { '+': 'zoom-in', '=': 'zoom-in', '-': 'zoom-out', '0': 'reset' };
      if (actions[event.key]) {
        event.preventDefault();
        act(actions[event.key]);
      } else if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const delta = camera.position.clone().sub(controls.target);
        const turn = event.key === 'ArrowLeft' ? -0.12 : 0.12;
        const tilt = event.key === 'ArrowUp' ? 0.09 : -0.09;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          delta.applyAxisAngle(camera.up, turn);
        } else {
          const right = new Vector3().crossVectors(delta, camera.up).normalize();
          if (right.lengthSq() > 0) delta.applyAxisAngle(right, tilt);
        }
        camera.position.copy(controls.target).add(delta);
        controls.update();
      }
    });
  } catch (error) {
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    throw error;
  }
}

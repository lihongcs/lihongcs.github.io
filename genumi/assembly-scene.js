import {
  Box3, DirectionalLight, HemisphereLight, MeshStandardMaterial, PerspectiveCamera,
  Raycaster, Scene, Vector2, Vector3, WebGLRenderer, GLTFLoader, OrbitControls,
} from "./vendor/three-cad.js";
import { bindJointMotion } from "./joint-motion.js";

function collectMeshes(model, modules) {
  const byNodeName = new Map(modules.flatMap((module) => {
    return [module.id, ...(module.nodes ?? [])].map((name) => [name, module]);
  }));
  const meshes = [];
  model.traverse((object) => {
    if (object.isLine || object.isPoints) object.visible = false;
    if (!object.isMesh) return;
    if (!object.geometry.getAttribute("normal")) object.geometry.computeVertexNormals();
    let module = null;
    for (let current = object; current && !module; current = current.parent) {
      module = byNodeName.get(current.userData.moduleId) ??
        byNodeName.get(current.name) ?? byNodeName.get(current.name.replace(/_\d+$/, ""));
    }
    meshes.push({ object, module, material: object.material, visible: object.visible });
  });
  return meshes;
}

function getViewBounds(meshes, center, direction, cameraUp) {
  const right = cameraUp.clone().cross(direction).normalize();
  const up = direction.clone().cross(right);
  const point = new Vector3();
  const projection = new Vector3();
  const bounds = new Box3();
  for (const { object, visible } of meshes) {
    if (!visible) continue;
    const positions = object.geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).sub(center);
      projection.set(point.dot(right), point.dot(up), point.dot(direction));
      bounds.expandByPoint(projection);
    }
  }
  return bounds;
}

export async function createAssemblyViewer({ container, modelUrl, accessoriesUrl, motion, cameraPose, name, modules,
  onSelect, onContextLost, onMotionChange }) {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", `${name} interactive assembly model`);
  canvas.setAttribute("aria-describedby", "model-instructions");

  const scene = new Scene();
  const camera = new PerspectiveCamera(36);
  if (cameraPose?.up) camera.up.set(...cameraPose.up).normalize();
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;

  const sky = new HemisphereLight(0xfff6ea, 0x696e79, 2.4);
  const key = new DirectionalLight(0xffffff, 2.2);
  const fill = new DirectionalLight(0xc3d7fa, .95);
  scene.add(sky, key, fill);

  let model;
  let meshes;
  let jointMotion;
  let angle = motion?.defaultAngle ?? 0;
  let jointDriveEnabled = true;
  const bounds = new Box3();
  let resizeObserver;
  const selectionMaterial = new MeshStandardMaterial({ color: 0xdd973c, roughness: .68 });
  const draw = () => renderer.render(scene, camera);

  function release() {
    resizeObserver?.disconnect();
    controls.removeEventListener("change", draw);
    controls.dispose();
    const geometries = new Set();
    const materials = new Set([selectionMaterial]);
    const originalMaterials = new Map(meshes?.map(({ object, material }) => [object, material]));
    model?.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const original = originalMaterials.get(object) ?? object.material;
      for (const material of [].concat(original)) {
        if (material) materials.add(material);
      }
    });
    const textures = new Set();
    for (const material of materials) {
      for (const property of Object.values(material)) {
        if (property?.isTexture) textures.add(property);
      }
      material.dispose();
    }
    geometries.forEach((geometry) => geometry.dispose());
    textures.forEach((texture) => texture.dispose());
    renderer.dispose();
    canvas.remove();
  }

  try {
    const loader = new GLTFLoader();
    ({ scene: model } = await loader.loadAsync(modelUrl));
    if (accessoriesUrl) {
      const accessories = await loader.loadAsync(accessoriesUrl);
      model.add(accessories.scene);
    }
    scene.add(model);
    model.updateMatrixWorld(true);
    meshes = collectMeshes(model, modules);
    jointMotion = bindJointMotion(model, motion);
    jointMotion?.setAngle(angle);
    for (const { object, visible } of meshes) {
      if (visible) bounds.union(new Box3().setFromObject(object));
    }
    if (bounds.isEmpty()) throw new Error("The assembly has no visible mesh geometry.");
  } catch (error) {
    release();
    throw error;
  }

  const center = bounds.getCenter(new Vector3());
  const radius = Math.max(bounds.getSize(new Vector3()).length() / 2, 0.000001);
  const viewDirection = new Vector3(...(cameraPose?.direction ?? [1, .68, 1.25])).normalize();
  const viewBounds = getViewBounds(meshes, center, viewDirection, camera.up);
  const halfWidth = Math.max(Math.abs(viewBounds.min.x), Math.abs(viewBounds.max.x));
  const halfHeight = Math.max(Math.abs(viewBounds.min.y), Math.abs(viewBounds.max.y));
  key.position.copy(center).addScaledVector(new Vector3(2, 4, 3), radius);
  key.target.position.copy(center);
  fill.position.copy(center).addScaledVector(new Vector3(-4, 1, -2), radius);
  fill.target.position.copy(center);
  scene.add(key.target, fill.target);
  camera.near = radius * .005;
  camera.far = radius * 60;
  controls.minDistance = radius * .12;
  controls.maxDistance = radius * 30;

  function reset() {
    const verticalSlope = Math.tan(camera.fov * Math.PI / 360);
    const horizontalSlope = verticalSlope * camera.aspect;
    const fit = Math.max(halfWidth / horizontalSlope, halfHeight / verticalSlope);
    const distance = 1.14 * fit + viewBounds.max.z;
    camera.position.copy(center).addScaledVector(viewDirection, distance);
    controls.target.copy(center);
    controls.update();
    draw();
  }

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    draw();
  }

  function select(moduleId, isolated) {
    for (const mesh of meshes) {
      const selected = Boolean(moduleId) && mesh.module?.id === moduleId;
      mesh.object.visible = mesh.visible && (!isolated || selected);
      mesh.object.material = selected ? selectionMaterial : mesh.material;
    }
    draw();
  }

  const ray = new Raycaster();
  const pointer = new Vector2();
  const meshModules = new Map(meshes.map(({ object, module }) => [object, module]));
  const meshObjects = meshes.map(({ object }) => object);
  let press = null;
  let jointDrag = null;

  function setJointAngle(degrees) {
    if (!jointMotion) return;
    const value = Math.max(motion.min, Math.min(motion.max, degrees));
    if (jointMotion.setAngle(value)) {
      angle = value;
      draw();
    }
    return angle;
  }

  function hitAt(x, y) {
    const { left, top, width, height } = canvas.getBoundingClientRect();
    pointer.set((x - left) / width * 2 - 1, 1 - (y - top) / height * 2);
    ray.setFromCamera(pointer, camera);
    return ray.intersectObjects(meshObjects.filter((mesh) => mesh.visible), false)[0];
  }

  function endJointDrag() {
    jointDrag = null;
    controls.enabled = true;
    canvas.classList.remove("driving-joint");
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.isPrimary && event.button === 0) {
      press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    } else {
      press = null;
    }
    if (!jointDriveEnabled || !jointMotion || !event.isPrimary || event.button !== 0) return;
    const hit = hitAt(event.clientX, event.clientY);
    const target = jointMotion.dragTarget(hit?.object);
    if (!target) return;
    const offset = hit.point.clone().sub(target.pivot);
    const rotated = hit.point.clone().addScaledVector(
      new Vector3().crossVectors(jointMotion.axis, offset), target.ratio * Math.PI / 180,
    );
    const projected = hit.point.clone().project(camera);
    rotated.project(camera).sub(projected);
    const { width, height } = canvas.getBoundingClientRect();
    const delta = new Vector2(rotated.x * width / 2, -rotated.y * height / 2);
    if (delta.lengthSq() < 0.015) delta.set(target.ratio > 0 ? 1 : -1, 0);
    jointDrag = { ...press, angle, delta, hit };
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("driving-joint");
  }, true);
  canvas.addEventListener("pointermove", (event) => {
    if (jointDrag?.id === event.pointerId) {
      const movement = new Vector2(event.clientX - jointDrag.x, event.clientY - jointDrag.y);
      if (movement.lengthSq() < 16 && press) return;
      press = null;
      const degrees = movement.dot(jointDrag.delta) / jointDrag.delta.lengthSq();
      onMotionChange?.(setJointAngle(jointDrag.angle + degrees));
      return;
    }
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) press = null;
  });
  canvas.addEventListener("pointercancel", () => { press = null; endJointDrag(); });
  canvas.addEventListener("lostpointercapture", endJointDrag);
  canvas.addEventListener("pointerup", (event) => {
    const hit = jointDrag?.hit;
    if (jointDrag?.id === event.pointerId) endJointDrag();
    if (press?.id !== event.pointerId) return;
    press = null;
    const module = meshModules.get((hit ?? hitAt(event.clientX, event.clientY))?.object);
    if (module) onSelect(module);
  });

  canvas.addEventListener("keydown", (event) => {
    const offset = camera.position.clone().sub(controls.target);
    const step = Math.PI / 24;
    const tilt = new Vector3().crossVectors(camera.up, offset).normalize();
    switch (event.key) {
      case "ArrowLeft": offset.applyAxisAngle(camera.up, step); break;
      case "ArrowRight": offset.applyAxisAngle(camera.up, -step); break;
      case "ArrowUp":
      case "ArrowDown": {
        const next = offset.clone().applyAxisAngle(tilt, event.key === "ArrowUp" ? step : -step);
        if (Math.abs(next.clone().normalize().dot(camera.up)) < .995) offset.copy(next);
        break;
      }
      case "+":
      case "=": offset.multiplyScalar(.85); break;
      case "-": offset.divideScalar(.85); break;
      default: return;
    }
    event.preventDefault();
    camera.position.copy(controls.target).add(offset);
    controls.update();
  });

  canvas.addEventListener("webglcontextlost", onContextLost, { once: true });
  container.append(canvas);
  resize();
  reset();
  controls.addEventListener("change", draw);
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  return {
    select,
    reset,
    hasModule: (id) => meshes.some((mesh) => mesh.module?.id === id),
    setJointAngle: jointMotion ? setJointAngle : null,
    setJointDriveEnabled: jointMotion ? (enabled) => {
      jointDriveEnabled = enabled;
      if (!enabled) endJointDrag();
    } : null,
    dispose: release,
  };
}

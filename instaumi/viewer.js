const elements = Object.fromEntries([
  "variant-switcher", "view-switcher", "variant-name", "reset-view", "explode-view", "viewport", "fallback-preview",
  "model-status", "model-selection",
  "model-instructions", "assembly-download", "variant-note", "module-empty", "module-list",
  "module-detail", "module-name", "module-description", "part-download", "isolate-module",
  "stl-library-link", "orbit-instructions", "joint-motion", "joint-motion-link", "joint-drag", "joint-play",
  "joint-reset", "joint-angle", "joint-angle-label", "joint-angle-value", "joint-range-min",
  "joint-range-max", "joint-motion-note",
].map((id) => [id, document.getElementById(id)]));

let selectedModule = null;
let isolated = false;
let assemblyViewer = null;
let joint = null;
let playbackFrame = null;
let applyingJointAngle = false;
const moduleButtons = new Map();

function setText(id, value) {
  elements[id].textContent = value ?? "";
  elements[id].hidden = !value;
}

function setDownload(id, path) {
  if (path) {
    elements[id].href = path;
  } else {
    elements[id].removeAttribute("href");
  }
  elements[id].hidden = !path;
}

function showSelection() {
  for (const [id, button] of moduleButtons) {
    button.setAttribute("aria-pressed", String(id === selectedModule?.id));
  }
  elements["module-detail"].hidden = !selectedModule;
  setText("module-name", selectedModule?.name);
  setText("module-description", selectedModule?.description);
  setDownload("part-download", selectedModule?.stl);

  const moduleIsVisible = assemblyViewer?.hasModule(selectedModule?.id);
  setText("model-selection", moduleIsVisible ? selectedModule.name : null);
  const isolateButton = elements["isolate-module"];
  isolateButton.hidden = !moduleIsVisible;
  isolateButton.textContent = isolated ? "Show all modules" : "Isolate module";
  isolateButton.setAttribute("aria-pressed", String(isolated));
  assemblyViewer?.select(selectedModule?.id, isolated);
}

function selectModule(module) {
  selectedModule = module;
  if (!assemblyViewer?.hasModule(module.id)) isolated = false;
  showSelection();
}

function showPreview(variant, message, name = variant?.name) {
  const preview = elements["fallback-preview"];
  if (variant?.preview) {
    preview.src = variant.preview;
    preview.alt = `CAD render of ${name}`;
    preview.hidden = false;
  }
  setText("model-status", message);
}

function addViewLink(container, label, variantId, viewId, current) {
  const link = document.createElement("a");
  const query = new URLSearchParams({ variant: variantId });
  if (viewId) query.set("view", viewId);
  link.href = `?${query}`;
  link.textContent = label;
  if (current) link.setAttribute("aria-current", "true");
  container.append(link);
}

const angleFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

function describeAngle(angle) {
  return `${angleFormat.format(Math.abs(angle) < 0.005 ? 0 : angle)}°`;
}

function showJointAngle(angle) {
  if (!joint || !Number.isFinite(angle)) return;
  joint.angle = Math.min(joint.max, Math.max(joint.min, angle));
  elements["joint-angle"].value = joint.angle;
  const description = describeAngle(joint.angle);
  elements["joint-angle"].setAttribute("aria-valuetext", `${description.slice(0, -1)} degrees`);
  elements["joint-angle-value"].textContent = description;
}

function setJointAngle(angle) {
  showJointAngle(angle);
  applyingJointAngle = true;
  try {
    const realized = assemblyViewer.setJointAngle(joint.angle);
    if (Number.isFinite(realized)) showJointAngle(realized);
  } finally {
    applyingJointAngle = false;
  }
}

function pauseJointMotion() {
  if (playbackFrame !== null) cancelAnimationFrame(playbackFrame);
  playbackFrame = null;
  elements["joint-play"].textContent = "Play";
}

function playJointMotion() {
  let lastTime = null;
  let direction = joint.angle >= joint.max ? -1 : 1;
  const speed = (joint.max - joint.min) / 3;
  elements["joint-play"].textContent = "Pause";

  function tick(time) {
    const elapsed = lastTime === null ? 0 : Math.min(time - lastTime, 50) / 1000;
    lastTime = time;
    const angle = joint.angle + direction * speed * elapsed;
    if (angle >= joint.max || angle <= joint.min) direction = angle >= joint.max ? -1 : 1;
    setJointAngle(angle);
    playbackFrame = requestAnimationFrame(tick);
  }

  playbackFrame = requestAnimationFrame(tick);
}

function setDragMode(enabled) {
  assemblyViewer.setJointDriveEnabled?.(enabled);
  elements["joint-drag"].setAttribute("aria-pressed", String(enabled));
  elements["orbit-instructions"].textContent = enabled
    ? "Drag a fingertip to drive the joints. Drag empty space to orbit."
    : "Drag to orbit.";
}

function showExplodedState(exploded, transitioning) {
  const toggle = elements["explode-view"];
  const suspended = exploded || transitioning;
  toggle.textContent = exploded ? "Reassemble" : "Explode";
  toggle.setAttribute("aria-pressed", String(exploded));
  toggle.disabled = transitioning;
  for (const id of ["joint-angle", "joint-drag", "joint-play", "joint-reset"]) {
    elements[id].disabled = suspended;
  }
  if (suspended) {
    elements["orbit-instructions"].textContent = "Drag to orbit. Reset view restores the exploded layout. Reassemble to move the joints.";
  } else if (joint) {
    setDragMode(elements["joint-drag"].getAttribute("aria-pressed") === "true");
  }
}

function initJointMotion(motion) {
  if (!Number.isFinite(motion?.min) || !Number.isFinite(motion?.max) || motion.min >= motion.max ||
      typeof assemblyViewer.setJointAngle !== "function") return;

  const { min, max, label, note } = motion;
  const step = Number.isFinite(motion.step) && motion.step > 0 ? motion.step : .1;
  const initialAngle = Number.isFinite(motion.defaultAngle) ? motion.defaultAngle : 0;
  joint = { min, max, initialAngle: Math.min(max, Math.max(min, initialAngle)) };
  const slider = elements["joint-angle"];
  slider.min = min;
  slider.max = max;
  slider.step = step;
  setText("joint-angle-label", label ?? "Joint angle");
  setText("joint-range-min", describeAngle(min));
  setText("joint-range-max", describeAngle(max));
  if (note) setText("joint-motion-note", note);
  elements["joint-motion"].hidden = false;
  elements["joint-motion-link"].hidden = false;
  elements["joint-drag"].hidden = typeof assemblyViewer.setJointDriveEnabled !== "function";
  setDragMode(!elements["joint-drag"].hidden);
  setJointAngle(joint.initialAngle);
}

async function start() {
  const response = await fetch("models/manifest.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("The assembly manifest is unavailable.");
  const { variants } = await response.json();
  const parameters = new URLSearchParams(location.search);
  const requestedId = parameters.get("variant");
  const requestedView = parameters.get("view");
  const active = variants.find((variant) => variant.id === requestedId) ?? variants[0];
  if (!active) throw new Error("The assembly manifest contains no variants.");
  elements["stl-library-link"].href = `stl.html?variant=${encodeURIComponent(active.id)}`;

  for (const variant of variants) {
    addViewLink(elements["variant-switcher"], variant.name, variant.id, null, variant === active);
  }

  const views = active.views ?? [];
  const activeView = views.find((view) => view.id === requestedView);
  if (views.length) {
    const switcher = elements["view-switcher"];
    addViewLink(switcher, active.viewName ?? "Assembly", active.id, null, !activeView);
    for (const view of views) {
      addViewLink(switcher, view.name, active.id, view.id, view === activeView);
    }
    switcher.hidden = false;
  }
  const modelData = activeView ?? active;
  const modelName = activeView ? `${active.name} ${activeView.name}` : active.name;

  setText("variant-name", active.name);
  setText("variant-note", modelData.note ?? active.note);
  setDownload("assembly-download", modelData.assemblyStl);
  if (modelData.assemblyDownloadLabel) {
    elements["assembly-download"].firstChild.textContent = `${modelData.assemblyDownloadLabel} `;
  }

  const modules = modelData.modules ?? active.modules ?? [];
  const moduleList = elements["module-list"];
  elements["module-empty"].hidden = modules.length > 0;
  for (const module of modules) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = module.name;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => selectModule(module));
    item.append(button);
    moduleList.append(item);
    moduleButtons.set(module.id, button);
  }

  if (!modelData.model) {
    showPreview(modelData, "An interactive 3D model is unavailable for this view.", modelName);
    return;
  }
  setText("model-status", "Loading the 3D model…");

  try {
    const { createAssemblyViewer } = await import("./assembly-scene.js");
    assemblyViewer = await createAssemblyViewer({
      container: elements.viewport,
      modelUrl: modelData.model,
      accessoriesUrl: modelData.accessories,
      motion: modelData.motion,
      cameraPose: modelData.camera,
      name: modelName,
      modules,
      variant: active.id,
      onSelect: selectModule,
      onExplodedChange: showExplodedState,
      onMotionChange(angle) {
        if (!applyingJointAngle) pauseJointMotion();
        showJointAngle(angle);
      },
      onContextLost() {
        assemblyViewer?.dispose();
        assemblyViewer = null;
        pauseJointMotion();
        joint = null;
        isolated = false;
        elements["reset-view"].disabled = true;
        elements["explode-view"].hidden = true;
        elements["model-instructions"].hidden = true;
        elements["joint-motion"].hidden = true;
        elements["joint-motion-link"].hidden = true;
        showSelection();
        showPreview(modelData, "The 3D display is unavailable. You can still browse and download the modules.", modelName);
      },
    });
    setText("model-status", "");
    elements["model-instructions"].hidden = false;
    elements["reset-view"].disabled = false;
    elements["explode-view"].hidden = typeof assemblyViewer.setExploded !== "function";
    initJointMotion(modelData.motion);
    showSelection();
  } catch (error) {
    console.warn("InstaUMI 3D model:", error);
    showPreview(modelData, "The 3D display could not load. You can still browse and download the modules.", modelName);
  }
}

elements["reset-view"].addEventListener("click", () => {
  isolated = false;
  showSelection();
  assemblyViewer?.reset();
});

elements["explode-view"].addEventListener("click", ({ currentTarget }) => {
  pauseJointMotion();
  if (isolated) {
    isolated = false;
    showSelection();
  }
  assemblyViewer?.setExploded(currentTarget.getAttribute("aria-pressed") !== "true");
});

elements["isolate-module"].addEventListener("click", () => {
  isolated = !isolated;
  showSelection();
});

elements["joint-angle"].addEventListener("input", ({ currentTarget }) => {
  pauseJointMotion();
  setJointAngle(currentTarget.valueAsNumber);
});

elements["joint-play"].addEventListener("click", () => {
  if (playbackFrame === null) playJointMotion();
  else pauseJointMotion();
});

elements["joint-reset"].addEventListener("click", () => {
  pauseJointMotion();
  setJointAngle(joint.initialAngle);
});

elements["joint-drag"].addEventListener("click", ({ currentTarget }) => {
  setDragMode(currentTarget.getAttribute("aria-pressed") !== "true");
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseJointMotion();
});

start().catch((error) => {
  console.warn("InstaUMI assembly details:", error);
  elements["module-empty"].hidden = false;
  showPreview(null, "Assembly details could not load. Please refresh the page.");
});

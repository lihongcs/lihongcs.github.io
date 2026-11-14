const elements = Object.fromEntries([
  "variant-switcher", "view-switcher", "variant-name", "reset-view", "viewport", "fallback-preview",
  "model-status", "model-selection",
  "model-instructions", "assembly-download", "variant-note", "module-empty", "module-list",
  "module-detail", "module-name", "module-description", "part-download", "isolate-module",
  "step-library-link",
].map((id) => [id, document.getElementById(id)]));

let selectedModule = null;
let isolated = false;
let assemblyViewer = null;
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
  setDownload("part-download", selectedModule?.step);

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
    preview.alt = `SolidWorks preview of ${name}`;
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

async function start() {
  const response = await fetch("models/manifest.json");
  if (!response.ok) throw new Error("The assembly manifest is unavailable.");
  const { variants } = await response.json();
  const parameters = new URLSearchParams(location.search);
  const requestedId = parameters.get("variant");
  const requestedView = parameters.get("view");
  const active = variants.find((variant) => variant.id === requestedId) ?? variants[0];
  if (!active) throw new Error("The assembly manifest contains no variants.");
  elements["step-library-link"].href = `steps.html?variant=${encodeURIComponent(active.id)}`;

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
  setDownload("assembly-download", modelData.assemblyStep);
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
      name: modelName,
      modules,
      onSelect: selectModule,
      onContextLost() {
        assemblyViewer?.dispose();
        assemblyViewer = null;
        isolated = false;
        elements["reset-view"].disabled = true;
        elements["model-instructions"].hidden = true;
        showSelection();
        showPreview(modelData, "The 3D display is unavailable. You can still browse and download the modules.", modelName);
      },
    });
    setText("model-status", "");
    elements["model-instructions"].hidden = false;
    elements["reset-view"].disabled = false;
    showSelection();
  } catch (error) {
    console.warn("GenUMI 3D model:", error);
    showPreview(modelData, "The 3D display could not load. You can still browse and download the modules.", modelName);
  }
}

elements["reset-view"].addEventListener("click", () => {
  isolated = false;
  showSelection();
  assemblyViewer?.reset();
});

elements["isolate-module"].addEventListener("click", () => {
  isolated = !isolated;
  showSelection();
});

start().catch((error) => {
  console.warn("GenUMI assembly details:", error);
  elements["module-empty"].hidden = false;
  showPreview(null, "Assembly details could not load. Please refresh the page.");
});

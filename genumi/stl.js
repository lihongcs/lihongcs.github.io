const status = document.getElementById("library-status");
const list = document.getElementById("stl-list");

const kindLabels = {
  assembly: "Assembly",
  subassembly: "Subassembly",
  part: "Part",
  reference: "Reference",
};

function getDownloads(variant) {
  if (variant.downloads) return variant.downloads;
  const entries = (variant.modules ?? []).map((module) => ({
    name: module.name,
    stl: module.stl,
    kind: "part",
  }));
  if (variant.assemblyStl) {
    entries.unshift({ name: variant.name, stl: variant.assemblyStl, kind: "assembly" });
  }
  return entries;
}

function createDownload({ name, stl, kind }) {
  const item = document.createElement("li");
  const detail = document.createElement("div");
  const title = document.createElement("strong");
  const filename = document.createElement("small");
  const link = document.createElement("a");
  const file = new URL(stl, location.href).pathname.split("/").pop();
  const label = kindLabels[kind?.toLowerCase()] ?? kind;
  title.textContent = name;
  filename.textContent = [label, decodeURIComponent(file)].filter(Boolean).join(" · ");
  link.href = stl;
  link.download = "";
  link.className = "viewer-button";
  link.textContent = "Download STL";
  link.setAttribute("aria-label", `Download STL for ${name}`);
  detail.append(title, filename);
  item.append(detail, link);
  return item;
}

async function loadDownloads() {
  const response = await fetch("models/manifest.json");
  if (!response.ok) throw new Error("The STL manifest is unavailable.");
  const { variants } = await response.json();
  const requested = new URLSearchParams(location.search).get("variant");
  const active = variants.find((variant) => variant.id === requested) ?? variants[0];
  if (!active) throw new Error("The STL manifest contains no variants.");
  document.getElementById("variant-name").textContent = active.name;
  document.getElementById("viewer-link").href = `viewer.html?variant=${encodeURIComponent(active.id)}`;
  for (const variant of variants) {
    const link = document.createElement("a");
    link.href = `?variant=${encodeURIComponent(variant.id)}`;
    link.textContent = variant.name;
    if (variant === active) link.setAttribute("aria-current", "true");
    document.getElementById("variant-switcher").append(link);
  }

  if (active.note) {
    const note = document.getElementById("variant-note");
    note.textContent = active.note;
    note.hidden = false;
  }

  const downloads = getDownloads(active).filter(({ stl }) => stl);
  for (const download of downloads) list.append(createDownload(download));
  list.hidden = !downloads.length;
  status.hidden = Boolean(downloads.length);
  status.textContent = downloads.length ? "" : "STL files are unavailable for this variant.";
}

loadDownloads().catch((error) => {
  console.warn("InstaUMI STL downloads:", error);
  status.textContent = "STL downloads could not load. Please refresh the page.";
});

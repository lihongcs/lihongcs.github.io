export async function startViewer(root) {
  if (root.dataset.cadLoading === 'true') return;
  const trigger = root.querySelector('[data-cad-start]');
  const status = root.querySelector('[data-cad-status]');
  const preview = root.querySelector('[data-cad-preview]');
  root.dataset.cadLoading = 'true';
  trigger.disabled = true;
  status.hidden = false;
  status.textContent = 'Loading 3D model…';

  try {
    const { mountViewer } = await import('./viewer.mjs?v=trigger-recess-grip');
    await mountViewer(root);
    if (preview) preview.hidden = true;
    trigger.hidden = true;
  } catch (error) {
    status.textContent = 'The 3D model could not be opened. Check WebGL or use the STEP downloads below.';
    console.error(error);
    trigger.disabled = false;
    root.dataset.cadLoading = 'false';
  }
}

for (const root of document.querySelectorAll('[data-cad-viewer]')) {
  root.querySelector('[data-cad-start]').addEventListener('click', () => startViewer(root));
}

async function renderParts(root) {
  const manifest = new URL(root.dataset.parts, document.baseURI);
  try {
    const response = await fetch(manifest);
    if (!response.ok) return;
    const { parts } = await response.json();
    if (!Array.isArray(parts) || !parts.length) return;
    const list = root.querySelector('ul');
    for (const entry of parts) {
      const target = new URL(entry.href, manifest);
      if (target.origin !== location.origin || !target.pathname.endsWith('.step')) continue;
      const link = document.createElement('a');
      link.href = target.href;
      link.download = '';
      link.textContent = entry.label;
      const item = document.createElement('li');
      item.append(link);
      list.append(item);
    }
    root.hidden = list.children.length === 0;
  } catch {
    // The complete parts archive remains available through its HTML download link.
  }
}

for (const root of document.querySelectorAll('[data-parts]')) renderParts(root);

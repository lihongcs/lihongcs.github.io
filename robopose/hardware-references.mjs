const panel = document.querySelector('[data-vive-import]');
const input = panel.querySelector('[data-vive-file]');
const status = panel.querySelector('[data-vive-status]');
const viewers = new Set();
let tracker;

function replaceTracker(viewer) {
  return viewer.replaceReference('HTC VIVE Ultimate Tracker', tracker.clone(true));
}

for (const root of document.querySelectorAll('[data-cad-reference-import]')) {
  root.addEventListener('cadready', ({ detail }) => {
    viewers.add(detail);
    panel.hidden = false;
    if (tracker) replaceTracker(detail);
  });
}

input.addEventListener('change', async () => {
  const file = input.files?.[0];
  if (!file) return;
  input.disabled = true;
  status.textContent = 'Loading HTC geometry…';
  try {
    const { loadViveFactoryMesh } = await import('./vive-factory.mjs');
    tracker = await loadViveFactoryMesh(file);
    const updated = [...viewers].filter(replaceTracker).length;
    status.textContent = updated ? 'HTC’s original geometry is now in use.' : 'The tracker reference could not be located.';
  } catch (error) {
    status.textContent = error.message || 'The HTC CAD could not be opened.';
  } finally {
    input.disabled = false;
    input.value = '';
  }
});

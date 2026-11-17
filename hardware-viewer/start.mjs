export async function startViewer(root) {
  if (root.dataset.cadLoading === 'true' || root.dataset.cadReady === 'true') return;
  const trigger = root.querySelector('[data-cad-start]');
  const status = root.querySelector('[data-cad-status]');
  const preview = root.querySelector('[data-cad-preview]');
  root.dataset.cadLoading = 'true';
  if (trigger) trigger.disabled = true;
  status.hidden = false;
  status.textContent = 'Loading 3D model…';

  try {
    const { mountViewer } = await import('./viewer.mjs?v=robopose');
    await mountViewer(root);
    if (preview) preview.hidden = true;
    if (trigger) trigger.hidden = true;
  } catch (error) {
    status.textContent = preview
      ? 'The interactive 3D model could not load. The assembly preview is still available.'
      : 'The 3D model could not load. Check that WebGL is available and try again.';
    console.error(error);
    if (trigger) {
      trigger.disabled = false;
      trigger.hidden = false;
    }
  } finally {
    root.dataset.cadLoading = 'false';
  }
}

function mountGripperTabs(list) {
  const tabs = [...list.querySelectorAll('a[href^="#"]')];
  const panels = tabs.map((tab) => document.getElementById(tab.hash.slice(1)));
  list.setAttribute('role', 'tablist');

  function activate(index) {
    tabs.forEach((tab, position) => {
      const selected = position === index;
      tab.tabIndex = selected ? 0 : -1;
      tab.setAttribute('aria-selected', String(selected));
      panels[position].hidden = !selected;
    });
  }

  function activateFromLocation() {
    const index = panels.findIndex((panel) =>
      panel.id === location.hash.slice(1) || panel.contains(document.getElementById(location.hash.slice(1))));
    activate(Math.max(0, index));
  }

  function select(index) {
    if (location.hash !== tabs[index].hash) history.pushState(null, '', tabs[index].hash);
    activate(index);
  }

  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[index].id);
    panels[index].setAttribute('role', 'tabpanel');
    tab.addEventListener('click', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      select(index);
    });
    tab.addEventListener('keydown', (event) => {
      const targets = {
        ArrowRight: (index + 1) % tabs.length,
        ArrowLeft: (index - 1 + tabs.length) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      };
      if (event.key === ' ') {
        event.preventDefault();
        select(index);
      } else if (Object.hasOwn(targets, event.key)) {
        event.preventDefault();
        const next = targets[event.key];
        select(next);
        tabs[next].focus();
      }
    });
  });

  activateFromLocation();
  window.addEventListener('hashchange', activateFromLocation);
  window.addEventListener('popstate', activateFromLocation);
}

for (const list of document.querySelectorAll('[data-gripper-tabs]')) mountGripperTabs(list);

for (const root of document.querySelectorAll('[data-cad-viewer]')) {
  root.querySelector('[data-cad-start]')?.addEventListener('click', () => startViewer(root));
  if (!root.hasAttribute('data-cad-autoload')) continue;

  if (typeof IntersectionObserver !== 'function') {
    startViewer(root);
    continue;
  }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    startViewer(root);
  }, { rootMargin: '600px 0px' });
  observer.observe(root.querySelector('[data-cad-surface]'));
}

async function renderParts(root) {
  const manifest = new URL(root.dataset.parts, document.baseURI);
  try {
    const response = await fetch(manifest, { cache: 'no-cache' });
    if (!response.ok) return;
    const { parts } = await response.json();
    if (!Array.isArray(parts) || !parts.length) return;
    const list = root.querySelector('ul');
    for (const entry of parts) {
      const target = new URL(entry.href, manifest);
      if (target.origin !== location.origin || !target.pathname.toLowerCase().endsWith('.stl')) continue;
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

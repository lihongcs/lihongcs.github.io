/* Plain static site: no analytics or third-party video player. */
const fmt = n => n == null ? '—' : Number(n).toFixed(2);
const safe = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const table = (heads, rows) => `<table><thead><tr>${heads.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
const numericRow = (name, values, highlight = false) => `<tr${highlight ? ' class="ours"' : ''}><th scope="row">${safe(name)}</th>${values.map(v => `<td>${fmt(v)}</td>`).join('')}</tr>`;

fetch('media/results.json').then(r => { if (!r.ok) throw new Error('Results unavailable'); return r.json(); }).then(data => {
  const renderDataset = key => {
    document.querySelector('#vt-table').innerHTML = table(['Training configuration','Object-level<span>RGB Top-5 ↑</span>','Patch-level<span>RGB E@5 ↑</span>','Material<span>mAP ↑</span>','Category<span>Acc. ↑</span>','Avg. ↑'], data[key].map(row => numericRow(row.name, row.values, row.name === 'Patch Tac + CL')));
  };
  renderDataset('touch3d');
  const tabs = [...document.querySelectorAll('[data-dataset]')];
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => {
      tabs.forEach(b => {b.setAttribute('aria-selected', String(b === button)); b.tabIndex = b === button ? 0 : -1;});
      document.querySelector('#vt-panel').setAttribute('aria-labelledby', button.id);
      renderDataset(button.dataset.dataset);
    });
    button.addEventListener('keydown', e => {
      if (!['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus(); tabs[next].click();
    });
  });
  document.querySelector('#multimodal-table').innerHTML = table(['Method','Global RGB<span>Top-5</span>','Global D<span>Top-5</span>','Global P<span>Top-5</span>','Local RGB<span>E@5</span>','Local D<span>E@5</span>','Local P<span>E@5</span>','Material<span>mAP</span>','Category<span>Acc.</span>','Avg.<span>V–T</span>','Avg.<span>All</span>'],data.multimodal.map(row => numericRow(row.name, row.values, row.name === 'GeoTAC')));
  const ablation = document.querySelector('#ablation-chart');
  ablation.setAttribute('aria-label', 'Touch3D reported ablation averages: ' + data.ablation.map(r => `${r.name} ${fmt(r.average)}`).join('; '));
  ablation.innerHTML = data.ablation.map(row => `<div class="bar-row${row.name === 'GeoTAC' ? ' ours' : ''}"><span>${safe(row.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${row.average / 50 * 100}%"></div></div><span class="bar-value">${fmt(row.average)}</span></div>`).join('') + '<p class="note">Reported vision–tactile average (%) · axis range 0–50.</p>';
  const policyRows = data.policy.map(row => `<tr${row.name === 'GeoTAC' ? ' class="ours"' : ''}><th scope="row">${safe(row.name)}</th>${row.successes.map((successes, i) => `<td>${fmt(successes / row.trials * 100)} / ${fmt(row.task_progress[i])}</td>`).join('')}<td>${fmt(row.average_sr)}</td><td>${fmt(row.average_tp)}</td></tr>`);
  document.querySelector('#policy-table').innerHTML = table(['Encoder',...data.tasks.map(task => `${safe(task)}<span>SR / TP</span>`),'Avg. SR ↑','Avg. TP ↑'],policyRows);
}).catch(() => {
  ['vt-table','multimodal-table','ablation-chart','policy-table'].forEach(id => {document.getElementById(id).innerHTML = '<p class="load-error">The result table could not load. <a href="media/results.json">Open the reported data</a>, or reload this page.</p>';});
});

// GIF-like previews load on visibility and pause off-screen. Respect reduced
// motion and data saving; the full narrated video never auto-plays.
const previews = [...document.querySelectorAll('.loop-video')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = reducedMotion.matches || Boolean(navigator.connection?.saveData);
const motionButton = document.querySelector('#motion-toggle');
const visible = new Set();
function load(video) { if (video.dataset.src && !video.getAttribute('src')) { video.src = video.dataset.src; video.load(); } }
function updateButton() { motionButton.textContent = paused ? 'Play animations' : 'Pause animations'; motionButton.setAttribute('aria-pressed', String(paused)); }
function playVisible() { if (!paused && !document.hidden) visible.forEach(v => {load(v); v.play().catch(() => {});}); }
const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  const v = entry.target;
  if (entry.isIntersecting) {visible.add(v); if (!paused) {load(v); v.play().catch(() => {});}}
  else {visible.delete(v); v.pause();}
}), {threshold:.25});
previews.forEach(v => {observer.observe(v);v.addEventListener('pointerdown', () => load(v), {once:true});v.addEventListener('keydown', () => load(v), {once:true});});
motionButton.addEventListener('click', () => {paused = !paused;if (paused) previews.forEach(v => v.pause());else playVisible();updateButton();});
reducedMotion.addEventListener('change', e => {paused = e.matches;if (paused) previews.forEach(v => v.pause());else playVisible();updateButton();});
document.addEventListener('visibilitychange', () => {if (document.hidden) previews.forEach(v => v.pause());else playVisible();});
updateButton();

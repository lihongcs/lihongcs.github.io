'use strict';
const results = [
  {name:'Vision-only', average:34.3,erase:18,screw:38,bottle:47,stowing:34},
  {name:'VisTacLinear',average:39.6,erase:31.5,screw:31,bottle:50.5,stowing:45.5},
  {name:'TacFiLM',average:31.1,erase:5.5,screw:36.5,bottle:39,stowing:43.5},
  {name:'TactileConcat',average:20.4,erase:20,screw:9,bottle:22.5,stowing:30},
  {name:'ForceVT (ours)',average:52.6,erase:49,screw:48.5,bottle:58,stowing:55,ours:true}
];
const chart=document.querySelector('#performance-chart');
function showTask(task){
  chart.replaceChildren(...results.map(r=>{
    const row=document.createElement('div');row.className='bar-row'+(r.ours?' ours':'');
    const name=document.createElement('span');name.textContent=r.name;
    const track=document.createElement('div');track.className='bar-track';track.setAttribute('aria-hidden','true');
    const fill=document.createElement('div');fill.className='bar-fill';fill.style.width=(r[task]/60*100)+'%';track.append(fill);
    const value=document.createElement('span');value.className='bar-value';value.textContent=r[task].toFixed(1)+'%';
    row.append(name,track,value);return row;
  }));
  document.querySelectorAll('[data-task]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.task===task)));
}
showTask('average');
document.querySelectorAll('[data-task]').forEach(b=>b.addEventListener('click',()=>showTask(b.dataset.task)));
const videos=[...document.querySelectorAll('.loop-video')];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let paused=reduced.matches;
const toggle=document.querySelector('#toggle-clips');
function loadVideo(v){if(!v.getAttribute('src')){v.src=v.dataset.src;v.load();}}
function syncButton(){toggle.textContent=paused?'Play all clips':'Pause all clips';toggle.setAttribute('aria-pressed',String(paused));}
syncButton();
function play(v){v.muted=true;loadVideo(v);v.play().catch(()=>{});}
const observer=new IntersectionObserver(entries=>{for(const {target:v,isIntersecting} of entries){v.dataset.visible=String(isIntersecting);if(isIntersecting){loadVideo(v);if(!paused)play(v);}else v.pause();}},{threshold:.2});
videos.forEach(v=>{observer.observe(v);v.addEventListener('pointerdown',()=>loadVideo(v),{once:true});v.addEventListener('focus',()=>loadVideo(v),{once:true});});
toggle.addEventListener('click',()=>{paused=!paused;syncButton();videos.forEach(v=>{if(paused)v.pause();else if(v.dataset.visible==='true')play(v);});});
reduced.addEventListener('change',e=>{paused=e.matches;syncButton();videos.forEach(v=>{if(paused)v.pause();else if(v.dataset.visible==='true')play(v);});});
const full=document.querySelector('#full-video');
full.addEventListener('toggle',()=>{const v=full.querySelector('video');if(full.open)loadVideo(v);else v.pause();});
function expandFull(){if(location.hash==='#full-video')full.open=true;}
addEventListener('hashchange',expandFull);expandFull();
document.addEventListener('visibilitychange',()=>{videos.forEach(v=>{if(document.hidden)v.pause();else if(!paused&&v.dataset.visible==='true')play(v);});});

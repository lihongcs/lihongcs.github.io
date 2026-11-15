const stages = {
  x5: [
    {
      name: 'Capture',
      file: 'x5-capture.webp?v=dual-wrist',
      clip: 'x5-full-episode.mp4',
      title: 'Record a demonstration',
      alt: 'Full pepper-sorting demonstration from the left and right X5 wrist cameras',
      text: 'Start both cameras and mark episodes in InstaDataCap.',
      context: 'Pepper sorting · 15.2 s',
      guide: 'capture',
      link: 'Capture guide',
    },
    {
      name: 'Align',
      file: 'x5-bench-sync.webp',
      title: 'Align cameras and trackers',
      alt: 'Measured X5 clock offsets relative to the BLE anchor and fit residuals for both wrists',
      text: 'Read the original INSV files and align both wrists using gyro and VIVE motion.',
      context: 'Cloth-folding benchmark · 43.29 s',
      guide: 'x5-sync-guide',
      link: 'Alignment details',
    },
    {
      name: 'Gripper',
      file: 'x5-bench-gripper.webp?v=bimanual',
      clip: 'x5-bench-gripper.mp4',
      clipHeight: 800,
      title: 'Measure gripper opening',
      alt: 'Synchronized left and right gripper close-ups and their calibrated opening in millimetres',
      text: 'Convert ArUco marker separation to gripper opening.',
      context: 'Cloth-folding replay · 13.10 s',
      guide: 'x5-gripper-guide',
      link: 'Gripper details',
    },
    {
      name: 'LeRobot',
      file: 'x5-bench-export.webp',
      title: 'Export training episodes',
      alt: 'Six 224 × 224 RGB views from one frame of the benchmark’s LeRobot dataset',
      text: 'Write synchronized wrist views, poses, and gripper openings to LeRobot v2.1.',
      context: 'Cloth-folding benchmark · 25 episodes at 30 Hz',
      guide: 'x5-export-guide',
      link: 'Export details',
    },
  ],
  x3: [
    {
      name: 'Capture',
      file: '../instadatacap-dashboard.webp',
      title: 'Record directly to Ubuntu',
      alt: 'InstaDataCap interface during a simulated dual-arm session',
      text: 'Select Wired USB to preview and record from the camera.',
      context: 'InstaDataCap · Simulated session',
      guide: 'x3',
      link: 'X3 setup guide',
    },
    {
      name: 'Read UVC',
      file: 'x3-raw.webp',
      title: 'Read the native UVC stream',
      alt: 'Synthetic preview of the X3 vertical dual-fisheye format',
      text: 'Read vertically stacked fisheyes at 1920 × 1080 and 30 fps.',
      context: 'MJPEG · Synthetic example',
      guide: 'x3-record',
      link: 'Recording guide',
    },
    {
      name: 'Sync',
      file: 'x3-sync.webp',
      title: 'Check host timestamps',
      alt: 'Synthetic example of X3 frame and tracker timestamps on the shared host clock',
      text: 'Check frame continuity and confirm overlap with the tracker timestamps.',
      context: 'Synthetic timing example',
      guide: 'x3-processing',
      link: 'Timing checks',
    },
    {
      name: 'Inspect MP4',
      file: 'x3-output.webp',
      title: 'Inspect the recording',
      alt: 'Synthetic Stage 01 output showing the dual-fisheye layout preserved in MP4',
      text: 'Write an MP4 inspection copy and timing reports.',
      context: '30 fps · Synthetic example',
      guide: 'x3-processing',
      link: 'Inspection guide',
    },
  ],
};

const options = document.querySelector('[data-camera-options]');
const stepControls = document.querySelector('[data-steps]');
const art = document.querySelector('[data-art]');
const clip = document.querySelector('[data-clip]');
const title = document.querySelector('[data-stage-title]');
const description = document.querySelector('[data-stage-text]');
const context = document.querySelector('[data-stage-context]');
const guide = document.querySelector('[data-stage-guide]');
const guideText = document.querySelector('[data-stage-link]');
const cameraButtons = Array.from(options.querySelectorAll('button'));
let camera = 'x5';
let current = 0;

function showStage(index) {
  const stage = stages[camera][index];
  current = index;
  const artwork = 'assets/workflow/' + stage.file;
  art.hidden = Boolean(stage.clip);
  clip.hidden = !stage.clip;
  if (stage.clip) {
    const source = 'assets/workflow/' + stage.clip;
    clip.poster = artwork;
    clip.height = stage.clipHeight ?? 534;
    clip.setAttribute('aria-label', stage.alt);
    clip.querySelector('a').href = source;
    if (clip.getAttribute('src') !== source) clip.src = source;
  } else {
    art.src = artwork;
    art.alt = stage.alt;
    if (clip.hasAttribute('src')) {
      clip.pause();
      clip.removeAttribute('src');
      clip.load();
    }
  }
  title.textContent = stage.title;
  description.textContent = stage.text;
  context.textContent = stage.context;
  guideText.textContent = stage.link;
  guide.setAttribute('href', 'guide.html#' + stage.guide);
  Array.from(stepControls.children).forEach((button, position) => {
    if (position === index) {
      button.setAttribute('aria-current', 'step');
    } else {
      button.removeAttribute('aria-current');
    }
  });
}

function showCamera(model) {
  camera = model;
  cameraButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.camera === model));
  });
  const buttons = stages[model].map((stage, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = stage.name;
    button.setAttribute('aria-controls', 'workflow-stage');
    button.addEventListener('click', () => showStage(index));
    return button;
  });
  stepControls.replaceChildren(...buttons);
  showStage(0);
}

cameraButtons.forEach(button => {
  button.addEventListener('click', () => {
    if (camera !== button.dataset.camera) showCamera(button.dataset.camera);
  });
});

stepControls.addEventListener('keydown', event => {
  const buttons = Array.from(stepControls.children);
  const focused = buttons.indexOf(event.target);
  if (focused === -1) return;
  const last = buttons.length - 1;
  const destinations = {
    ArrowLeft: focused === 0 ? last : focused - 1,
    ArrowRight: focused === last ? 0 : focused + 1,
    Home: 0,
    End: last,
  };
  if (!(event.key in destinations)) return;
  event.preventDefault();
  const next = destinations[event.key];
  buttons[next].focus();
  if (next !== current) showStage(next);
});

showCamera(camera);
options.hidden = false;
stepControls.hidden = false;

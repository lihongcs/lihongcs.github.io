const stages = {
  x5: [
    {
      name: 'Capture',
      file: 'x5-capture.webp',
      title: 'Record a demonstration',
      alt: 'X5 Bluetooth capture illustrated beside a wrist image from the pepper-sorting session',
      text: 'Control each X5 over Bluetooth and mark episodes in InstaDataCap.',
      guide: 'capture',
    },
    {
      name: 'Read INSV',
      file: 'x5-raw.webp',
      clip: 'x5-raw.webm',
      title: 'Read the original recordings',
      alt: 'Wrist camera views from a recorded pepper-sorting session',
      text: 'Extract wrist views and camera timestamps from the original INSV files.',
      guide: 'processing',
    },
    {
      name: 'Sync',
      file: 'x5-sync.webp',
      title: 'Align camera and tracker clocks',
      alt: 'Clock fit from the X5 session, with 95th-percentile residuals of 1.40 and 1.25 milliseconds',
      text: 'Match X5 gyroscope readings with VIVE motion. Fit error p95 in this session was 1.40 ms and 1.25 ms.',
      guide: 'x5-sync-guide',
    },
    {
      name: 'Gripper',
      file: 'x5-gripper.webp',
      title: 'Measure gripper opening',
      alt: 'Estimated opening in the left and right grippers during the pepper-sorting session',
      text: 'Detect the jaw markers and convert their separation to an opening in metres.',
      guide: 'x5-gripper-guide',
    },
    {
      name: 'LeRobot',
      file: 'x5-export.webp',
      title: 'Export training episodes',
      alt: 'Sample images from a LeRobot export with 168 episodes, 88,675 frames and a 60 Hz output rate',
      text: 'This LeRobot export contains 168 episodes and 88,675 frames at 60 Hz. The current launcher defaults to 30 Hz.',
      guide: 'x5-export-guide',
    },
  ],
  x3: [
    {
      name: 'Capture',
      file: 'x3-capture.webp',
      title: 'Record directly to Ubuntu',
      alt: 'X3 wired capture illustrated with a synthetic dual-fisheye input',
      text: 'Select Wired USB to preview, record, and mark episodes.',
      guide: 'x3',
    },
    {
      name: 'Read UVC',
      file: 'x3-raw.webp',
      title: 'Read the native UVC stream',
      alt: 'Synthetic preview of the X3 vertical dual-fisheye format',
      text: 'X3 Webcam records vertically stacked fisheyes at 1920 × 1080 and 30 Hz. Layout shown with synthetic inputs.',
      guide: 'x3-record',
    },
    {
      name: 'Sync',
      file: 'x3-sync.webp',
      title: 'Check host timestamps',
      alt: 'Synthetic example of X3 frame and tracker timestamps on the shared host clock',
      text: 'Stage 01 checks frame continuity and camera-to-tracker overlap. Synthetic timing example.',
      guide: 'x3-processing',
    },
    {
      name: 'Inspect MP4',
      file: 'x3-output.webp',
      title: 'Remux and inspect',
      alt: 'Synthetic Stage 01 output showing the dual-fisheye layout preserved in MP4',
      text: 'Stage 01 writes a 30 Hz inspection MP4 and timing reports. Output shown from a synthetic test.',
      guide: 'x3-processing',
    },
  ],
};

const options = document.querySelector('[data-camera-options]');
const stepControls = document.querySelector('[data-steps]');
const art = document.querySelector('[data-art]');
const clip = document.querySelector('[data-clip]');
const title = document.querySelector('[data-stage-title]');
const description = document.querySelector('[data-stage-text]');
const guide = document.querySelector('[data-stage-guide]');
const cameraButtons = Array.from(options.querySelectorAll('button'));
let camera = 'x5';
let current = 0;

function showStage(index) {
  const stage = stages[camera][index];
  current = index;
  const artwork = 'assets/workflow/' + stage.file;
  art.src = artwork;
  art.alt = stage.alt;
  art.hidden = Boolean(stage.clip);
  clip.hidden = !stage.clip;
  if (stage.clip) {
    clip.poster = artwork;
    clip.src = 'assets/workflow/' + stage.clip;
  } else if (clip.hasAttribute('src')) {
    clip.pause();
    clip.removeAttribute('src');
    clip.load();
  }
  title.textContent = stage.title;
  description.textContent = stage.text;
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

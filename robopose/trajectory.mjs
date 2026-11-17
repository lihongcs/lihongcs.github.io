const tracks = [
  { label: "Flexiv reference", color: "#c56510" },
  { label: "iPhone 15 Pro", color: "#2458b8" },
  { label: "HTC VIVE Ultimate", color: "#7057a8" },
  { label: "Meta Quest 3S", color: "#007b83" },
  { label: "RoboBaton Mini", color: "#23734a" },
  { label: "Insta360 X5", color: "#b93978" },
];
const initialView = { azimuth: 0.5, elevation: 0.65 };
const gridSpacing = 0.05;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const axisColors = ["#a2463d", "#33735b", "#315e96"];
const unitAxes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

const dot = (a, b) => a.reduce((sum, component, index) => sum + component * b[index], 0);
const mix = (a, b, fraction) => a.map((value, axis) => value + (b[axis] - value) * fraction);

function interpolateOrientation(a, b, fraction) {
  const end = dot(a, b) < 0 ? b.map((component) => -component) : b;
  const blended = mix(a, end, fraction);
  const length = Math.hypot(...blended);
  return blended.map((component) => component / length);
}

function toolAxes([x, y, z, w]) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
  ];
}

function poseDifference(reference, pose) {
  const translation = Math.hypot(...pose.position.map((value, axis) => value - reference.position[axis])) * 1000;
  const rotation = Math.acos(clamp(Math.abs(dot(reference.orientation, pose.orientation)), 0, 1)) * 360 / Math.PI;
  return `${translation.toFixed(1)} mm · ${rotation.toFixed(1)}°`;
}

function makeLayout(positions) {
  const lower = [Infinity, Infinity, Infinity];
  const upper = [-Infinity, -Infinity, -Infinity];
  for (const path of positions) {
    for (const point of path) {
      for (let axis = 0; axis < 3; axis++) {
        lower[axis] = Math.min(lower[axis], point[axis]);
        upper[axis] = Math.max(upper[axis], point[axis]);
      }
    }
  }
  const x0 = gridSpacing * Math.floor(lower[0] / gridSpacing);
  const x1 = gridSpacing * Math.ceil(upper[0] / gridSpacing);
  const y0 = gridSpacing * Math.floor(lower[1] / gridSpacing);
  const y1 = gridSpacing * Math.ceil(upper[1] / gridSpacing);
  const floor = lower[2] - 0.015;
  const grid = [];
  for (let x = x0; x <= x1 + 0.001; x += gridSpacing) {
    grid.push([[x, y0, floor], [x, y1, floor]]);
  }
  for (let y = y0; y <= y1 + 0.001; y += gridSpacing) {
    grid.push([[x0, y, floor], [x1, y, floor]]);
  }
  const bounds = [...positions.flat(), ...grid.flat()];
  return { bounds, grid };
}

function makeProjection({ azimuth, elevation }, bounds, width, height) {
  const c = Math.cos(azimuth);
  const s = Math.sin(azimuth);
  const ce = Math.cos(elevation);
  const se = Math.sin(elevation);
  const rotate = ([x, y, z]) => [c * x - s * y, ce * z - se * (s * x + c * y)];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const point of bounds) {
    const [x, y] = rotate(point);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const scale = Math.min((width - 54) / (x1 - x0), (height - 70) / (y1 - y0));
  const project = (point) => {
    const [x, y] = rotate(point);
    return [width / 2 + scale * (x - (x0 + x1) / 2), height / 2 - scale * (y - (y0 + y1) / 2)];
  };
  return { project, rotate, scale };
}

function line(context, points) {
  context.beginPath();
  context.moveTo(...points[0]);
  for (let index = 1; index < points.length; index++) context.lineTo(...points[index]);
  context.stroke();
}

function drawTriad(context, projection, origin, axes, size, label = false, halo = false) {
  context.font = "600 11px Inter, system-ui, sans-serif";
  for (const [index, axis] of axes.entries()) {
    const [u, v] = projection.rotate(axis);
    const end = [origin[0] + size * u, origin[1] - size * v];
    if (halo) {
      context.lineWidth = 4.6;
      context.strokeStyle = "#fff";
      line(context, [origin, end]);
    }
    context.lineWidth = halo ? 2.2 : 1.45;
    context.strokeStyle = context.fillStyle = axisColors[index];
    line(context, [origin, end]);
    if (label) context.fillText("XYZ"[index], end[0] + (u >= 0 ? 4 : -9), end[1] + (v >= 0 ? -3 : 8));
  }
}

function drawAxes(context, projection, width, height) {
  drawTriad(context, projection, [33, height - 26], unitAxes, 21, true);

  const spacing = gridSpacing * projection.scale;
  const right = width - 18;
  const bottom = height - 23;
  context.strokeStyle = context.fillStyle = "#4a5853";
  line(context, [[right - spacing, bottom - 3], [right - spacing, bottom], [right, bottom], [right, bottom - 3]]);
  context.textAlign = "center";
  context.fillText("5 cm", right - spacing / 2, bottom + 15);
  context.textAlign = "start";
}

async function initializeTrajectory(root) {
  const canvas = root.querySelector("[data-trajectory-canvas]");
  const controls = root.querySelector("[data-trajectory-controls]");
  const play = root.querySelector("[data-trajectory-play]");
  const range = root.querySelector("[data-trajectory-time]");
  const clock = root.querySelector("[data-trajectory-clock]");
  const reset = root.querySelector("[data-trajectory-reset]");
  const legend = root.querySelector("[data-trajectory-tracks]");
  const status = root.querySelector("[data-trajectory-status]");
  const poster = root.querySelector("[data-trajectory-poster]");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas drawing is unavailable");

  const response = await fetch(root.dataset.source);
  if (!response.ok) throw new Error(`Trajectory data: ${response.status}`);
  const { samplePeriod, positions, orientations } = await response.json();
  const count = positions[0]?.length;
  if (!(samplePeriod > 0) || !(count > 1) || positions.length !== tracks.length ||
      positions.some((path) => path.length !== count || path.some((point) =>
        point.length !== 3 || !point.every(Number.isFinite))) ||
      orientations?.length !== tracks.length || orientations.some((path) =>
        path.length !== count || path.some((q) => q.length !== 4 || !q.every(Number.isFinite) ||
          Math.abs(Math.hypot(...q) - 1) > 0.0001))) {
    throw new Error("The trajectory data does not match its recorded sample layout");
  }

  const layout = makeLayout(positions);
  const duration = Number(((count - 1) * samplePeriod).toFixed(3));
  const selected = tracks.map(() => true);
  const view = { ...initialView };
  const poseCards = [];
  let time = duration;
  let playbackOrigin = null;
  let request = 0;
  let pointer = null;
  let geometry;

  function draw(timestamp) {
    request = 0;
    if (playbackOrigin !== null) {
      time = clamp((timestamp - playbackOrigin) / 1000, 0, duration);
      if (time >= duration) setPlaying(false);
    }
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width <= 54 || height <= 70) return;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * density);
    const pixelHeight = Math.round(height * density);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!geometry || geometry.width !== width || geometry.height !== height ||
        geometry.azimuth !== view.azimuth || geometry.elevation !== view.elevation) {
      const projection = makeProjection(view, layout.bounds, width, height);
      geometry = {
        width, height, ...view, projection,
        grid: layout.grid.map((segment) => segment.map(projection.project)),
        paths: positions.map((path) => path.map(projection.project)),
      };
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#d8e1dc";
    context.lineWidth = 1;
    for (const segment of geometry.grid) line(context, segment);

    const sample = clamp(time / samplePeriod, 0, count - 1);
    const index = Math.floor(sample);
    const next = Math.min(index + 1, count - 1);
    const fraction = sample - index;
    const poses = positions.map((path, track) => ({
      position: mix(path[index], path[next], fraction),
      orientation: interpolateOrientation(orientations[track][index], orientations[track][next], fraction),
    }));
    const markers = [];
    for (const [track, points] of geometry.paths.entries()) {
      if (!selected[track]) continue;
      const segment = points.slice(0, index + 1);
      const marker = geometry.projection.project(poses[track].position);
      segment.push(marker);
      context.strokeStyle = tracks[track].color;
      if (time < duration) {
        context.globalAlpha = 0.18;
        context.lineWidth = 1.4;
        line(context, points);
      }
      context.globalAlpha = 0.96;
      context.lineWidth = track === 0 ? 2.8 : 1.9;
      line(context, segment);
      markers.push({ track, point: marker, radius: track === 0 ? 4.9 : 3.6 });
    }
    context.globalAlpha = 1;
    for (const { track, point, radius } of markers) {
      context.beginPath();
      context.arc(...point, radius, 0, Math.PI * 2);
      context.fillStyle = tracks[track].color;
      context.fill();
      context.lineWidth = 1.3;
      context.strokeStyle = "#fff";
      context.stroke();
    }
    const focusPose = markers[0];
    if (focusPose) {
      drawTriad(context, geometry.projection, focusPose.point, toolAxes(poses[focusPose.track].orientation), 30, true, true);
    }
    drawAxes(context, geometry.projection, width, height);

    for (const [track, card] of poseCards.entries()) {
      card.context.clearRect(0, 0, 36, 36);
      drawTriad(card.context, geometry.projection, [18, 18], toolAxes(poses[track].orientation), 13);
      const reading = poseDifference(poses[0], poses[track]);
      if (card.value.textContent !== reading) card.value.textContent = reading;
    }

    const seconds = time.toFixed(2);
    range.value = seconds;
    range.setAttribute("aria-valuetext", `${seconds} of ${duration.toFixed(2)} seconds`);
    clock.textContent = `${seconds} / ${duration.toFixed(2)} s`;
    if (playbackOrigin !== null) queueDraw();
  }

  function queueDraw() {
    if (!request) request = requestAnimationFrame(draw);
  }

  function setPlaying(playing) {
    playbackOrigin = playing ? performance.now() - time * 1000 : null;
    play.textContent = playing ? "Pause" : "Play";
    queueDraw();
  }

  function rotate(dx, dy) {
    view.azimuth += dx;
    view.elevation = clamp(view.elevation + dy, -Math.PI / 2 + 0.04, Math.PI / 2 - 0.04);
    queueDraw();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (pointer || !event.isPrimary || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointer?.id !== event.pointerId) return;
    rotate((event.clientX - pointer.x) * 0.009, (event.clientY - pointer.y) * 0.009);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(type, (event) => {
      if (pointer?.id !== event.pointerId) return;
      pointer = null;
      canvas.classList.remove("is-dragging");
    });
  }
  const arrowRotations = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] };
  canvas.addEventListener("keydown", (event) => {
    const movement = arrowRotations[event.key];
    if (!movement) return;
    event.preventDefault();
    rotate(...movement);
  });

  play.addEventListener("click", () => {
    const start = playbackOrigin === null;
    if (start && time >= duration) time = 0;
    setPlaying(start);
  });
  range.min = 0;
  range.max = duration;
  clock.setAttribute("aria-live", "off");
  range.addEventListener("input", () => {
    time = range.valueAsNumber;
    setPlaying(false);
  });
  reset.addEventListener("click", () => {
    Object.assign(view, initialView);
    queueDraw();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && playbackOrigin !== null) setPlaying(false);
  });

  for (const [index, track] of tracks.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "trajectory-track";
    button.setAttribute("aria-pressed", "true");
    button.setAttribute("aria-label", track.label);
    button.style.setProperty("--track-color", track.color);
    const swatch = document.createElement("span");
    swatch.className = "trajectory-swatch";
    swatch.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    copy.className = "trajectory-pose-copy";
    const name = document.createElement("span");
    name.textContent = track.label;
    const value = document.createElement("span");
    value.className = "trajectory-pose-value";
    value.id = `trajectory-pose-value-${index}`;
    button.setAttribute("aria-describedby", value.id);
    copy.append(name, value);
    const triad = document.createElement("canvas");
    triad.width = triad.height = 72;
    triad.className = "trajectory-pose-axes";
    triad.setAttribute("aria-hidden", "true");
    const poseContext = triad.getContext("2d");
    poseContext.scale(2, 2);
    poseContext.lineCap = "round";
    poseCards.push({ context: poseContext, value });
    button.append(swatch, copy, triad);
    button.addEventListener("click", () => {
      selected[index] = !selected[index];
      button.setAttribute("aria-pressed", String(selected[index]));
      queueDraw();
    });
    legend.append(button);
  }
  canvas.hidden = false;
  controls.hidden = false;
  legend.hidden = false;
  status.hidden = true;
  if (poster) poster.hidden = true;
  new ResizeObserver(queueDraw).observe(canvas);
  queueDraw();
}

const scene = document.querySelector("[data-trajectory]");
if (scene) {
  initializeTrajectory(scene).catch(() => {
    scene.querySelector("[data-trajectory-status]").textContent = "The interactive trajectory could not load.";
  });
}

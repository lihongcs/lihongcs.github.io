const figure = document.querySelector('[data-slam-replay]');

async function enableOrbit() {
  const fallback = figure.querySelector('[data-slam-fallback]');
  const response = await fetch(new URL('./assets/workflow/slam-orbit-poses.json', import.meta.url));
  if (!response.ok) return;
  const data = await response.json();
  const {
    ArrowHelper, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, LineBasicMaterial,
    LineSegments, Mesh, MeshBasicMaterial, OrbitControls, PerspectiveCamera, Quaternion,
    Scene, SphereGeometry, Spherical, Vector3, WebGLRenderer,
  } = await import('../hardware-viewer/vendor/three-cad.mjs');
  if (!fallback.paused || fallback.currentTime > 0) return;

  const interactive = figure.querySelector('[data-slam-interactive]');
  const video = figure.querySelector('[data-slam-wrists]');
  const surface = figure.querySelector('[data-slam-scene]');
  const resetButton = figure.querySelector('[data-slam-reset]');
  const download = figure.querySelector('[data-slam-mp4]');
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '3D end-effector trajectories. Drag or use arrow keys to orbit. Home resets the view.');
  const scene = new Scene();
  scene.background = new Color('#f8f5ef');
  const camera = new PerspectiveCamera(35, 1, .018, 12);
  const orbit = new OrbitControls(camera, canvas);
  orbit.enablePan = false;
  orbit.minPolarAngle = .11;
  orbit.maxPolarAngle = Math.PI * .78;

  const up = new Vector3(0, 1, 0);
  const forward = new Vector3(...data.forward).normalize();
  const right = new Vector3().crossVectors(forward, up).normalize();
  const view = forward.clone().multiplyScalar(-1).addScaledVector(up, .84).normalize();
  const viewUp = new Vector3().crossVectors(view, right).normalize();
  const roles = ['left', 'right'];
  const colors = [0x196d69, 0xab502e];
  const localAxes = [new Vector3(1, 0, 0), up, new Vector3(0, 0, 1)];
  const orientations = [0xd23942, 0x16854e, 0x315bc4];
  const points = roles.flatMap(role => data[role].map(row => new Vector3(...row.slice(0, 3))));
  const bounds = points.map(p => [p.dot(right), p.y, p.dot(forward)]);
  const low = Array.from({ length: 3 }, (_, i) => Math.min(...bounds.map(row => row[i])));
  const high = Array.from({ length: 3 }, (_, i) => Math.max(...bounds.map(row => row[i])));
  const floor = Math.floor((low[1] - .03) * 10) / 10;
  const leftEdge = Math.floor((low[0] - .18) * 10) / 10;
  const rightEdge = Math.ceil((high[0] + .09) * 10) / 10;
  const near = Math.floor((low[2] - .12) * 10) / 10;
  const far = Math.ceil((high[2] + .09) * 10) / 10;
  const top = Math.ceil((high[1] + .04) * 10) / 10;
  function world(x, y, z) {
    return new Vector3().addScaledVector(right, x).addScaledVector(up, y).addScaledVector(forward, z);
  }
  function lines(points, material) {
    return new LineSegments(new BufferGeometry().setFromPoints(points), material);
  }

  const floorGrid = [], wallGrid = [], sideGrid = [];
  const sideNear = near + .10;
  for (let x = leftEdge; x <= rightEdge + .001; x += .10) {
    floorGrid.push(world(x, floor, near), world(x, floor, far));
    wallGrid.push(world(x, floor, far), world(x, top, far));
  }
  for (let z = near; z <= far + .001; z += .10) {
    floorGrid.push(world(leftEdge, floor, z), world(rightEdge, floor, z));
    if (z >= sideNear - .001) sideGrid.push(world(rightEdge, floor, z), world(rightEdge, top, z));
  }
  for (let y = floor; y <= top + .001; y += .10) {
    wallGrid.push(world(leftEdge, y, far), world(rightEdge, y, far));
    sideGrid.push(world(rightEdge, y, sideNear), world(rightEdge, y, far));
  }
  const ground = [world(leftEdge, floor, near), world(rightEdge, floor, near),
    world(rightEdge, floor, far), world(leftEdge, floor, far)];
  const back = [ground[3], ground[2], world(rightEdge, top, far), world(leftEdge, top, far)];
  function panel(corners, color) {
    const vertices = [0, 1, 2, 0, 2, 3].map(i => corners[i]);
    const geometry = new BufferGeometry().setFromPoints(vertices);
    return new Mesh(geometry, new MeshBasicMaterial({ color, transparent: true, opacity: .45, side: DoubleSide, depthWrite: false }));
  }
  scene.add(panel(ground, 0xece4d5), panel(back, 0xeee8de));
  scene.add(panel([world(rightEdge, floor, sideNear), ground[2], back[2], world(rightEdge, top, sideNear)], 0xf0e9de));
  scene.add(lines(floorGrid, new LineBasicMaterial({ color: 0xc9bdae })));
  scene.add(lines(wallGrid, new LineBasicMaterial({ color: 0xded4c6 })));
  scene.add(lines(sideGrid, new LineBasicMaterial({ color: 0xe4d9ca })));

  const cueColor = 0x6c655a;
  const forwardPoint = world(leftEdge + .05, floor + .003, near + .025);
  const upPoint = world(leftEdge + .05, floor, far);
  scene.add(new ArrowHelper(forward, forwardPoint, .175, cueColor, .038, .022));
  scene.add(new ArrowHelper(up, upPoint, .16, cueColor, .037, .022));
  const labels = [
    [figure.querySelector('[data-slam-forward]'), forwardPoint.clone().addScaledVector(forward, .175)],
    [figure.querySelector('[data-slam-up]'), upPoint.clone().addScaledVector(up, .165)],
  ];

  function createTrail(positions, color, radius, dashed = false) {
    const vertices = [], counts = [0];
    let phase = 0;
    function tube(from, to) {
      const direction = new Vector3().subVectors(to, from).normalize();
      const a = new Vector3().crossVectors(direction, Math.abs(direction.y) > .9 ? right : up).normalize();
      const b = new Vector3().crossVectors(direction, a);
      const ring = Array.from({ length: 6 }, (_, i) => a.clone().multiplyScalar(radius * Math.cos(i * Math.PI / 3))
        .addScaledVector(b, radius * Math.sin(i * Math.PI / 3)));
      for (let side = 0; side < ring.length; side++) {
        const first = ring[side], next = ring[(side + 1) % ring.length];
        for (const vertex of [
          from.clone().add(first), from.clone().add(next), to.clone().add(first),
          from.clone().add(next), to.clone().add(next), to.clone().add(first),
        ]) vertices.push(...vertex.toArray());
      }
    }
    for (let i = 1; i < positions.length; i++) {
      const start = positions[i - 1], end = positions[i];
      if (start && end) {
        const length = start.distanceTo(end);
        if (length > 1e-6 && !dashed) tube(start, end);
        if (length > 1e-6 && dashed) {
          for (let offset = 0; offset < length - 1e-7;) {
            const on = phase < .013;
            const interval = Math.min(length - offset, (on ? .013 : .024) - phase);
            if (on && interval > 1e-6) {
              tube(start.clone().lerp(end, offset / length), start.clone().lerp(end, (offset + interval) / length));
            }
            offset += interval;
            phase += interval;
            if (phase >= .024 - 1e-7) phase = 0;
          }
        }
      } else {
        phase = 0;
      }
      counts.push(vertices.length / 3);
    }
    const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3));
    const mesh = new Mesh(geometry, new MeshBasicMaterial({ color }));
    scene.add(mesh);
    return index => geometry.setDrawRange(0, counts[index]);
  }

  const arms = roles.map((role, index) => {
    const rows = data[role];
    const estimated = rows.map(row => new Vector3(...row.slice(0, 3)));
    const measured = rows.map(row => row.length === 10 ? new Vector3(...row.slice(7)) : null);
    const hits = new Group();
    const joints = localAxes.map((axis, i) => new ArrowHelper(axis, new Vector3(), .061, orientations[i], .015, .009));
    hits.add(...joints, new Mesh(new SphereGeometry(.009, 10, 8), new MeshBasicMaterial({ color: colors[index] })));
    const foot = new Mesh(new SphereGeometry(.012, 10, 8), new MeshBasicMaterial({
      color: colors[index], transparent: true, opacity: .45, depthWrite: false,
    }));
    foot.scale.y = .18;
    const riser = lines([new Vector3(), new Vector3()], new LineBasicMaterial({ color: colors[index], transparent: true, opacity: .6 }));
    riser.frustumCulled = false;
    scene.add(hits, foot, riser);
    const drawEstimated = createTrail(estimated, colors[index], .0028);
    const drawMeasured = createTrail(measured, new Color(colors[index]).lerp(new Color('#c9bdae'), .53), .0040, true);
    const drawShadow = createTrail(estimated.map(point => point.clone().setY(floor + .003)),
      new Color(colors[index]).lerp(new Color('#e8dfd0'), .72), .0021);
    const readout = figure.querySelector(`[data-slam-${role}]`);
    return frame => {
      const position = estimated[frame];
      const shadow = position.clone().setY(floor + .003);
      const orientation = new Quaternion(...rows[frame].slice(3, 7)).normalize();
      hits.position.copy(position);
      hits.quaternion.copy(orientation);
      foot.position.copy(shadow);
      const vertices = riser.geometry.getAttribute('position');
      vertices.setXYZ(0, shadow.x, shadow.y, shadow.z);
      vertices.setXYZ(1, position.x, position.y, position.z);
      vertices.needsUpdate = true;
      readout.textContent = measured[frame] ? `${(position.distanceTo(measured[frame]) * 1000).toFixed(1)} mm` : '—';
      drawMeasured(frame);
      drawEstimated(frame);
      drawShadow(frame);
    };
  });

  const center = world((leftEdge + rightEdge) / 2, (floor + top) / 2, (near + far) / 2);
  const corners = [...ground, ...back, ...points];
  function draw() {
    renderer.render(scene, camera);
    for (const [label, point] of labels) {
      const projected = point.clone().project(camera);
      label.hidden = Math.abs(projected.x) > .94 || Math.abs(projected.y) > .92;
      label.style.left = `${(projected.x + 1) * 50}%`;
      label.style.top = `${(1 - projected.y) * 50}%`;
    }
  }
  function reset() {
    const slope = Math.tan(camera.fov * Math.PI / 360);
    const distance = Math.max(...corners.map(corner => {
      const offset = corner.clone().sub(center);
      return offset.dot(view) + 1.08 * Math.max(
        Math.abs(offset.dot(right)) / (camera.aspect * slope), Math.abs(offset.dot(viewUp)) / slope,
      );
    }));
    orbit.target.copy(center);
    camera.position.copy(center).addScaledVector(view, distance);
    orbit.minDistance = distance * .45;
    orbit.maxDistance = distance * 3;
    orbit.update();
    draw();
  }

  let currentFrame = -1;
  function seek(time) {
    const frame = Math.min(data.left.length - 1, Math.max(0, Math.floor(time * data.fps + .001)));
    if (frame === currentFrame) return;
    currentFrame = frame;
    arms.forEach(update => update(frame));
    draw();
  }
  let pending = null;
  const videoFrames = typeof video.requestVideoFrameCallback === 'function';
  function playStep() {
    if (pending !== null || video.paused || video.ended) return;
    const step = (_, metadata) => {
      pending = null;
      seek(metadata?.mediaTime ?? video.currentTime);
      playStep();
    };
    pending = videoFrames ? video.requestVideoFrameCallback(step) : requestAnimationFrame(step);
  }
  function pauseStep() {
    if (pending !== null) {
      if (videoFrames) video.cancelVideoFrameCallback(pending);
      else cancelAnimationFrame(pending);
      pending = null;
    }
    seek(video.currentTime);
  }

  canvas.addEventListener('keydown', event => {
    if (event.key === 'Home') {
      event.preventDefault();
      reset();
      return;
    }
    const move = { ArrowLeft: [.13, 0], ArrowRight: [-.13, 0], ArrowUp: [0, -.13], ArrowDown: [0, .13] }[event.key];
    if (!move) return;
    event.preventDefault();
    const spherical = new Spherical().setFromVector3(camera.position.clone().sub(orbit.target));
    spherical.theta += move[0];
    spherical.phi += move[1];
    camera.position.copy(orbit.target).add(new Vector3().setFromSpherical(spherical));
    orbit.update();
  });

  const resize = new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = surface;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    draw();
  });

  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    resize.disconnect();
    video.pause();
    orbit.dispose();
    interactive.hidden = true;
    download.hidden = true;
    fallback.hidden = false;
    renderer.dispose();
  }, { once: true });
  resetButton.addEventListener('click', reset);
  orbit.addEventListener('change', draw);
  video.addEventListener('play', playStep);
  video.addEventListener('pause', pauseStep);
  video.addEventListener('seeking', () => seek(video.currentTime));
  video.addEventListener('ended', pauseStep);
  surface.prepend(canvas);
  interactive.hidden = false;
  const w = surface.clientWidth, h = surface.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  reset();
  seek(0);
  resize.observe(surface);
  download.hidden = false;
  fallback.hidden = true;
}

if (figure) {
  const load = () => enableOrbit().catch(error => console.warn('SLAM orbit replay unavailable', error));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    }, { rootMargin: '160px' });
    observer.observe(figure);
  } else load();
}

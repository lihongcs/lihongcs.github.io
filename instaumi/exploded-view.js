import { Box3, Vector3 } from "./vendor/three-cad.js";

const flexiv = {
  upperJaw: ["right-drive", "right-inner-link", "right-carrier", "left-fingertip-pad"],
  lowerJaw: ["left-drive", "left-inner-link", "left-carrier", "right-fingertip-pad"],
  upperPivots: ["pivot-p04", "pivot-p03", "pivot-p08", "pivot-p07"],
  lowerPivots: ["pivot-p01", "pivot-p02", "pivot-p05", "pivot-p06"],
  body: ["handheld-housing", "moving-handle"],
  tracker: ["vive-ultimate-tracker", "tracker-bracket"],
};

const robotiqJaw = ["drive", "proximal", "frame", "bar", "distal", "pad"];
const robotiqPivots = ["inner-chassis-pivot", "outer-chassis-pivot", "frame-and-bar-pivot",
  "distal-inner-pivot", "distal-outer-pivot"];
const robotiq = {
  upperJaw: robotiqJaw.map((part) => "right-" + part),
  lowerJaw: robotiqJaw.map((part) => "left-" + part),
  upperPivots: robotiqPivots.map((part) => "right-" + part),
  lowerPivots: robotiqPivots.map((part) => "left-" + part),
  body: ["handheld-body"],
  tracker: ["vive-ultimate-tracker"],
};

const cameraParts = ["insta360-camera", "insta360-quick-release", "camera-support"];

function measurePart(part, right, up) {
  const bounds = new Box3();
  const point = new Vector3();
  const projected = new Vector3();
  part.traverse((object) => {
    if (!object.isMesh) return;
    const positions = object.geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
      projected.set(point.dot(right), point.dot(up), 0);
      bounds.expandByPoint(projected);
    }
  });
  if (bounds.isEmpty()) return null;
  const { x: width, y: height } = bounds.getSize(new Vector3());
  return { part, width, height, center: bounds.getCenter(new Vector3()), home: part.position.clone() };
}

// Place complete part instances in horizontal rows. The margins are measured in
// model space so orthographic projection preserves separation on every screen.
function placeRows(rows, right, up) {
  const gap = .014;
  const offsets = [];
  const heights = rows.map((row) => Math.max(...row.map((item) => item.height)));
  let top = (heights.reduce((total, height) => total + height, 0) + gap * (rows.length - 1)) / 2;

  rows.forEach((row, index) => {
    const width = row.reduce((total, item) => total + item.width, 0) + gap * (row.length - 1);
    const y = top - heights[index] / 2;
    let left = -width / 2;
    for (const item of row) {
      const x = left + item.width / 2;
      const offset = right.clone().multiplyScalar(x - item.center.x)
        .addScaledVector(up, y - item.center.y);
      offsets.push({ part: item.part, offset, home: item.home });
      left += item.width + gap;
    }
    top -= heights[index] + gap;
  });

  return offsets;
}

export function createExplodedView(model, parts, variant, direction, cameraUp) {
  const layout = variant === "flexiv" ? flexiv : robotiq;
  if (variant !== "flexiv" && variant !== "robotiq") return null;

  const right = cameraUp.clone().cross(direction).normalize();
  const up = direction.clone().cross(right);
  let offsets = [];

  return {
    capturePose() {
      const measured = new Map();
      for (const part of parts) {
        const item = measurePart(part, right, up);
        if (item) measured.set(part.name, item);
      }

      const rows = [
        cameraParts,
        [...layout.tracker, ...layout.body],
        layout.upperJaw,
        [...layout.upperPivots, ...layout.lowerPivots],
        layout.lowerJaw,
      ].map((names) => names.flatMap((name) => {
        const item = measured.get(name);
        measured.delete(name);
        return item ? [item] : [];
      }));
      rows.push([...measured.values()]);
      offsets = placeRows(rows.filter((row) => row.length), right, up);
    },
    setAmount(amount) {
      for (const { part, home, offset } of offsets) {
        part.position.copy(home).addScaledVector(offset, amount);
      }
      model.updateMatrixWorld(true);
    },
  };
}

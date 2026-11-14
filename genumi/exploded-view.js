import { Vector3 } from "./vendor/three-cad.js";

// Offsets are in millimeters along the outward, fingertip and pivot axes.
const flexiv = {
  drive: [27, 1, 12],
  "inner-link": [26, 9, -27],
  carrier: [34, 29, 8],
  "fingertip-pad": [36, 55, 4],
};

const robotiq = {
  drive: [24, 0, 11],
  proximal: [32, 8, -23],
  frame: [36, 2, 32],
  bar: [67, 11, 2],
  distal: [40, 34, 4],
  pad: [41, 61, 4],
  "inner-chassis-pivot": [8, -8, 41],
  "outer-chassis-pivot": [28, -4, 46],
  "frame-and-bar-pivot": [68, -3, 36],
  "distal-inner-pivot": [28, 28, 43],
  "distal-outer-pivot": [62, 40, 42],
};

const flexivPivots = [
  [-35, -8, 48], [-8, -4, 37], [8, -4, 37], [35, -8, 48],
  [-49, 27, 39], [-22, 39, 52], [22, 39, 52], [49, 27, 39],
];

const accessoryOffsets = {
  "camera-support": [0, 8, -14],
  "insta360-quick-release": [0, 24, -34],
  "insta360-camera": [0, 62, -76],
  "tracker-bracket": [20, 0, 0],
  "vive-ultimate-tracker": [61, 0, 0],
  "handheld-housing": [0, 29, -17],
};

export function createExplodedView(model, parts, variant, pivotAxis) {
  if (variant !== "flexiv" && variant !== "robotiq") return null;

  const axial = new Vector3(...pivotAxis).normalize();
  const across = new Vector3(1, 0, 0);
  const forward = new Vector3().crossVectors(axial, across).normalize();
  const isFlexiv = variant === "flexiv";
  const layout = isFlexiv ? flexiv : robotiq;
  const offsets = [];

  for (const part of parts) {
    const name = part.name;
    const [side, ...words] = name.split("-");
    const piece = words.join("-");
    let offset;
    if (Object.hasOwn(accessoryOffsets, name)) {
      offset = new Vector3(...accessoryOffsets[name]);
    } else {
      const match = /^pivot-p0([1-8])$/.exec(name);
      const shift = isFlexiv && match ? flexivPivots[Number(match[1]) - 1] : layout[piece];
      if (!shift) continue;
      const [outward, along, lift] = shift;
      const sign = match ? 1 : ((side === "left") !== isFlexiv ? 1 : -1);
      const direction = isFlexiv && piece === "fingertip-pad" ? -sign : sign;
      offset = across.clone().multiplyScalar(outward * direction)
        .addScaledVector(forward, along).addScaledVector(axial, lift);
    }
    offsets.push({ part, offset: offset.multiplyScalar(.001), home: new Vector3() });
  }

  return {
    capturePose() {
      for (const { part, home } of offsets) home.copy(part.position);
    },
    setAmount(amount) {
      for (const { part, home, offset } of offsets) {
        part.position.copy(home).addScaledVector(offset, amount);
      }
      model.updateMatrixWorld(true);
    },
  };
}

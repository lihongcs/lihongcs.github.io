import { Box3, Quaternion, Vector3 } from './vendor/three-cad.mjs';
import { flexibleLead } from './flexible-lead.mjs';

// Joint centers in millimeters, measured at the Y-axis bores in the wearable STEP.
// The fixed-frame rotary links guide the cassette in Z. The center rocker and
// its two connecting rods guide the jaw carriages in X relative to the cassette.
const center = [0.09782, 73.75704];
const joints = [
  {
    side: -1,
    rockerPin: [-6.41751, 96.85575],
    jawPin: [-25.56694, 71.21791],
    framePin: [-31.89918, 15.89567],
    outerPin: [-46.26694, 72.08791],
  },
  {
    side: 1,
    rockerPin: [6.61315, 50.65833],
    jawPin: [26.36129, 75.83791],
    framePin: [32.10082, 15.89567],
    outerPin: [47.87209, 71.71025],
  },
];

const axis = new Vector3(0, 1, 0);
// At +30° the silicone faces are still 1.43 mm apart. -30° keeps the
// carriages clear of the guide ends. This interval is for the CAD demonstration.
const angleLimit = Math.PI / 6;

const jawNames = new Set([
  'Left Fingertip Support', 'Right Fingertip Support', 'Jaw Sliding Bar',
  'UMI Fingertip Back Cover', 'OV5647 Fisheye Camera Exterior', 'OV5647 USB Adapter PCB',
  'OV5647 Camera FPC', 'Flexible Matrix FSR 22 mm', 'Optical Window Support',
  'Optical Shroud', 'Gel Retainer Ring', 'Acrylic Contact Window',
  'Tactile Contact Surface', 'GB Small Pan Head Screw M3 x 5', 'GB Small Pan Head Screw M3 x 5 C',
  'GB Small Pan Head Screw M4 x 5', 'GB Small Pan Head Screw M2 x 8',
  'GB Small Pan Head Screw M3 x 4', 'Short Pivot M2x22 Low Head Screw', 'Short Pivot M2 Hex Nut',
]);

const cassetteNames = new Set([
  'Adaptive Linkage Support', 'Metal Linear Track', 'Sliding Bar Guide',
  'GB Small Pan Head Screw M2 x 6', 'AS5600 Carrier Board', 'AS5600 IC Package Reference',
  'AS5600 Angle Encoder Custom PCB', 'PCB Spacer OD5p8 ID3p5 L3p5',
]);

const rockerNames = new Set([
  'Center Encoder Rotor', 'Magnet D6 x 2p5 Diametric', 'Magnet Bondline 0p10 Reference',
  'GB Pan Head Screw M2 x 8',
]);

const outerNames = new Set([
  'Left Outer Link', 'Right Outer Link', 'GB Small Pan Head Screw M3 x 25', 'GB Hex Nut M3',
]);

function rotate(x, z, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [cos * x + sin * z, cos * z - sin * x];
}

function direction(x1, z1, x2, z2) {
  return Math.atan2(z2 - z1, x2 - x1);
}

function solveSide(joint, angle) {
  const { side, rockerPin: [rx, rz], jawPin: [jx, jz], framePin: [fx, fz], outerPin: [ox, oz] } = joint;
  const [x, z] = rotate(rx - center[0], rz - center[1], angle);
  const pinX = x + center[0];
  const pinZ = z + center[1];
  const length2 = (jx - rx) ** 2 + (jz - rz) ** 2;
  const jawX = pinX + side * Math.sqrt(Math.max(0, length2 - (jz - pinZ) ** 2));
  const dx = jawX - jx;
  const rodAngle = direction(rx, rz, jx, jz) - direction(pinX, pinZ, jawX, jz);

  const outerLength2 = (ox - fx) ** 2 + (oz - fz) ** 2;
  const outerX = ox + dx;
  const outerZ = fz + Math.sqrt(Math.max(0, outerLength2 - (outerX - fx) ** 2));
  const outerAngle = direction(fx, fz, ox, oz) - direction(fx, fz, outerX, outerZ);
  return { dx, dz: outerZ - oz, pinX, pinZ, rodAngle, outerAngle };
}

function mechanism(angle) {
  const sides = joints.map((joint) => solveSide(joint, angle));
  return {
    angle, sides,
    span: sides[1].dx - sides[0].dx,
    // The right outer link has the concentric front mate in the native CAD.
    dz: sides[0].dz,
  };
}

const closed = mechanism(angleLimit).span;
const open = mechanism(-angleLimit).span;
const travel = (open - closed) / 2;
const initialOpening = -closed / (open - closed);

function poseAt(opening) {
  if (opening === initialOpening) return mechanism(0);
  const target = closed + (open - closed) * opening;
  let low = -angleLimit;
  let high = angleLimit;
  for (let step = 0; step < 30; step++) {
    const mid = (low + high) / 2;
    if (mechanism(mid).span > target) low = mid;
    else high = mid;
  }
  return mechanism((low + high) / 2);
}

function capture(original) {
  const position = original.position.clone();
  const quaternion = original.quaternion.clone();
  return {
    object: original, position, quaternion,
    reset() {
      original.position.copy(position);
      original.quaternion.copy(quaternion);
    },
  };
}

function pivot(part, angle, x, z, dx = 0, dz = 0) {
  const [newX, newZ] = rotate(part.position.x - x, part.position.z - z, angle);
  part.object.position.set(x + newX + dx, part.position.y, z + newZ + dz);
  part.object.quaternion.copy(new Quaternion().setFromAxisAngle(axis, angle)).multiply(part.quaternion);
}

export function createGripperMotion(model) {
  // Each named STEP occurrence is a direct child of this GLTF scene. Multi-material
  // occurrences have several mesh children that share the same parent transform.
  const named = model.children.filter((object) => object.userData.label);
  const count = (label) => named.filter((object) => object.userData.label === label).length;
  if (count('Rotating Link') !== 2 || count('Center Encoder Rotor') !== 1 ||
      count('Left Fingertip Support') !== 1 || count('Right Fingertip Support') !== 1 ||
      count('Left Outer Link') !== 1 || count('Right Outer Link') !== 1) return null;

  model.updateMatrixWorld(true);
  const draggable = new Map();
  const parts = [];
  const leads = [];
  let encoderCable;
  for (const object of named) {
    const label = object.userData.label;
    if (label === 'AS5600 Encoder XH2.54 Ribbon Cable') {
      // The plug travels with the cassette. The ribbon flexes between the plug
      // and its handoff to the fixed frame before entering the shared sleeve.
      encoderCable = flexibleLead(object, ({ z }) => (z - 24) / (66 - 24));
      continue;
    }
    let kind;
    if (jawNames.has(label)) kind = 'jaw';
    else if (cassetteNames.has(label)) kind = 'cassette';
    else if (rockerNames.has(label) || label === 'GB Hex Nut M2') kind = 'rocker';
    else if (label === 'Rotating Link') kind = 'rod';
    else if (outerNames.has(label)) kind = 'outer';
    else if (label === 'Left Soldered FSR Lead Reference' ||
             label === 'Right Soldered FSR Lead Reference') kind = 'lead';
    else continue;

    const middle = new Box3().setFromObject(object, true).getCenter(new Vector3());
    const side = middle.x < center[0] ? 0 : 1;
    if (label === 'GB Hex Nut M2' && Math.abs(middle.x) >= 10) continue;

    if (kind === 'lead') {
      leads.push({ deform: flexibleLead(object, ({ x }) => (94.4 - Math.abs(x)) / (94.4 - 31.4)), side });
    } else {
      if (kind === 'jaw') draggable.set(object, joints[side].side);
      parts.push({ part: capture(object), kind, side });
    }
  }

  function setOpening(value) {
    if (!Number.isFinite(value)) return;
    const opening = Math.max(0, Math.min(1, value));
    const pose = poseAt(opening);
    for (const { part, kind, side } of parts) {
      part.reset();
      if (opening === initialOpening) continue;
      const state = pose.sides[side];
      const joint = joints[side];
      if (kind === 'jaw') {
        part.object.position.x += state.dx;
        part.object.position.z += pose.dz;
      } else if (kind === 'cassette') {
        part.object.position.z += pose.dz;
      } else if (kind === 'rocker') {
        pivot(part, pose.angle, ...center, 0, pose.dz);
      } else if (kind === 'rod') {
        const [x, z] = joint.rockerPin;
        pivot(part, state.rodAngle, x, z, state.pinX - x, state.pinZ - z + pose.dz);
      } else if (kind === 'outer') {
        pivot(part, state.outerAngle, ...joint.framePin);
      }
    }
    for (const { deform, side } of leads) deform(pose.sides[side].dx, pose.dz);
    encoderCable?.(0, pose.dz);
    model.updateMatrixWorld(true);
  }

  function directionFor(object) {
    for (let current = object; current && current !== model; current = current.parent) {
      const side = draggable.get(current);
      if (side) return side;
    }
    return 0;
  }

  return {
    initialOpening, setOpening, directionFor, getTravel: () => travel,
    movableObjects: parts.map(({ part }) => part.object),
  };
}

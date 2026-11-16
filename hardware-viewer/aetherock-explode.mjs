import { Box3, Vector3 } from './vendor/three-cad.mjs';

function separation(part, center) {
  const { label, module } = part.userData;
  const side = Math.sign(center.x) || 1;
  const out = (x, y, z) => new Vector3(side * x, y, z);

  switch (module) {
    case 'Gripper Mechanism':
      if (label === 'Upper Gripper Frame') return out(0, 0, 0);
      if (label === 'Adaptive Linkage Support') return out(0, -29, -5);
      if (label === 'Metal Linear Track') return out(0, -52, 3);
      if (label === 'Rotating Link') return out(19, -27, 10);
      if (/Outer Link$/.test(label)) return out(40, -38, -14);
      if (label === 'Jaw Sliding Bar') return out(37, -56, 18);
      if (label === 'Sliding Bar Guide') return out(21, -35, -5);
      return out(33, 0, 0);

    case 'GelSlim Mini Tactile Sensor':
      // Separate each optical stack along its real contact axis. The outer board
      // and camera ribbon stay on the opposite side from the silicone layers.
      switch (label) {
        case 'OV5647 USB Adapter PCB': return out(116, -35, 55);
        case 'OV5647 Camera FPC': return out(98, -35, 55);
        case 'OV5647 Fisheye Camera Exterior': return out(88, -35, 55);
        case 'Optical Window Support': return out(72, -35, 55);
        case 'Optical Shroud': return out(58, -35, 55);
        case 'Gel Retainer Ring': return out(44, -35, 55);
        case 'Acrylic Contact Window': return out(30, -35, 55);
        case 'Tactile Contact Surface': return out(15, -35, 55);
        case 'UMI Fingertip Back Cover': return out(75, -47, 37);
        default: return out(61, -35, 32);
      }

    case 'Force Sensing':
      if (label === 'Flexible Matrix FSR 22 mm') return out(82, -51, 36);
      if (/Soldered FSR Lead/.test(label)) return out(72, -47, 13);
      if (label === 'Force Sensor ADC Adapter') return out(82, -17, 0);
      if (/Board to Board Header$/.test(label)) return out(69, -17, 0);
      if (/Washer|Nut/.test(label)) return out(76, -17, 0);
      return out(57, -17, 0);

    case 'Angle Encoder':
      if (label === 'Center Encoder Rotor') return out(0, -18, 1);
      if (label === 'AS5600 Angle Encoder Custom PCB') return out(0, 89, -3);
      if (label === 'AS5600 Carrier Board' || label === 'AS5600 IC Package Reference') {
        return out(0, 66, -3);
      }
      if (/Spacer/.test(label)) return out(0, 47, -3);
      return out(0, 27, -3);

    case 'Wrist Vision':
      return out(18, label === 'Hikrobot Camera Mount' ? 49 : 89, 45);

    case 'Motion Tracking':
      return out(36, label === 'VIVE Tracker Mount' ? 32 : 68, -35);

    case 'Wearable Mounts':
      return out(0, label === 'Upper Arm Strap' ? -24 : -12, -58);

    case 'Controller':
      if (label === 'Controller Tray') return out(0, 18, -58);
      if (label === 'Orange Pi 4 Pro Custom GPIO PCB') return out(0, 73, -58);
      if (label === 'Large Tactile Pushbutton Module') return out(45, 36, -38);
      if (label === '10 mm Diffused RGB LED Module') return out(45, 36, -74);
      return out(0, 42, -58);

    case 'Wiring':
      return out(0, -34, -16);

    case 'Fasteners':
      return fastenerSeparation(label, center, out);

    default:
      return out(0, 0, 0);
  }
}

function fastenerSeparation(label, center, out) {
  // Generic hardware names repeat at unrelated joints. Attachment locations
  // identify the neighboring assembly without depending on glTF node order.
  if (center.z > 135) {
    if (/M3 x 5/.test(label)) return out(87, -35, 55);
    return out(77, -35, 55);
  }
  if (/Rear Pivot|Pivot M2p5/.test(label)) return out(38, -40, -14);
  if (/Short Pivot/.test(label)) return out(20, -44, 13);
  if (Math.abs(center.x) > 76) {
    return / M2 x 6$/.test(label) ? out(24, -35, -5) : out(42, 0, 0);
  }
  if (Math.abs(center.x) > 30) {
    return / M3 x 25$|Hex Nut M3$/.test(label) ? out(43, -41, -14) : out(39, -66, 18);
  }
  return out(18, -24, 11);
}

const opticalStackOrder = new Map([
  ['Tactile Contact Surface', -4],
  ['Acrylic Contact Window', -3],
  ['Gel Retainer Ring', -2],
  ['Optical Shroud', -1],
  ['Optical Window Support', 0],
  ['OV5647 Fisheye Camera', 1],
  ['Tactile Back Cover', 2],
  ['OV5647 USB Adapter PCB', 3],
  ['OV5647 Camera FPC', 4],
]);

function parallelSeparation(part, center, origin, scale) {
  const { label, module, motion } = part.userData;
  if (label === 'Parallel Gripper Frame') return new Vector3();
  if (module === 'GelSlim Mini Tactile Sensor' && motion) {
    const layer = opticalStackOrder.get(label.replace(/^(Left|Right) /, '')) ?? 0;
    return new Vector3(motion * scale * (0.26 + 0.052 * layer), -scale * 0.14, scale * 0.16);
  }
  const direction = center.clone().sub(origin);
  if (direction.lengthSq() <= Number.EPSILON) return new Vector3(0, scale * 0.15, 0);
  return direction.multiplyScalar(0.78).addScaledVector(direction.clone().normalize(), scale * 0.12);
}

export function createExplodedView(model, parallel = false) {
  const localBox = new Box3();
  const center = new Vector3();
  const current = new Vector3();
  const offset = new Vector3();
  model.updateWorldMatrix(true, true);
  const assemblyBounds = new Box3().setFromObject(model);
  const origin = assemblyBounds.getCenter(new Vector3());
  const scale = assemblyBounds.getSize(new Vector3()).length();
  const parts = model.children.filter((part) => part.userData.label).map((part) => {
    localBox.setFromObject(part).getCenter(center);
    const shift = parallel ? parallelSeparation(part, center, origin, scale) : separation(part, center);
    return { part, shift, assembled: part.position.clone(), last: part.position.clone() };
  });
  if (!parts.length) return null;
  let applied = 0;

  function partBounds(amount) {
    return parts.map(({ part, shift }) => {
      current.copy(part.position).addScaledVector(shift, amount - applied);
      offset.copy(model.localToWorld(current)).sub(part.getWorldPosition(center));
      return new Box3().setFromObject(part).translate(offset);
    });
  }

  return {
    apply(amount) {
      for (const { part, shift, assembled, last } of parts) {
        // Preserve externally changed joint poses and make reassembly exact.
        if (!part.position.equals(last)) assembled.copy(part.position).addScaledVector(shift, -applied);
        part.position.copy(assembled).addScaledVector(shift, amount);
        last.copy(part.position);
      }
      applied = amount;
      model.updateWorldMatrix(true, true);
    },
    partBounds,
    bounds(amount) {
      const bounds = new Box3();
      for (const part of partBounds(amount)) bounds.union(part);
      return bounds;
    },
  };
}

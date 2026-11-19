import { Matrix4, Quaternion, Vector3 } from './vendor/three-cad.mjs';
import { flexibleLead } from './flexible-lead.mjs';

export function createGripperMotion(model) {
  const motion = model.userData.parallelMotion;
  if (!motion || motion.axis?.length !== 3 || !motion.axis.every(Number.isFinite)) return null;
  if (motion.joints) return createLinkedMotion(model, motion);
  if (motion.travel?.length !== 2 || !motion.travel.every(Number.isFinite)) return null;

  const axis = new Vector3().fromArray(motion.axis);
  const [minimum, maximum] = motion.travel;
  const range = maximum - minimum;
  if (!axis.lengthSq() || range <= 0 || minimum > 0 || maximum < 0) return null;
  axis.normalize();

  const moving = new Map();
  const leads = [];
  model.updateMatrixWorld(true);
  const worldOrigin = model.localToWorld(new Vector3());
  const travel = model.localToWorld(axis.clone()).sub(worldOrigin);
  for (const part of model.children) {
    const side = part.userData.motion;
    if (side === -1 || side === 1) moving.set(part, { side, assembled: part.position.clone() });
    const lead = part.userData.flexibleLead;
    if (lead) {
      const from = model.localToWorld(new Vector3().fromArray(lead.movingEnd));
      const to = model.localToWorld(new Vector3().fromArray(lead.fixedEnd));
      const length = to.sub(from).dot(travel);
      const deform = flexibleLead(part, (position) => 1 - position.sub(from).dot(travel) / length);
      leads.push({ deform, side: lead.side });
    }
  }
  if (![-1, 1].every((side) => [...moving.values()].some((part) => part.side === side))) return null;

  const worldTravel = travel.clone().multiplyScalar(range);

  return {
    initialOpening: -minimum / range,
    movableObjects: [...moving.keys()],
    setOpening(opening) {
      const displacement = minimum + opening * range;
      for (const [part, { side, assembled }] of moving) {
        part.position.copy(assembled).addScaledVector(axis, displacement * side);
      }
      for (const { deform, side } of leads) {
        deform(travel.x * displacement * side, travel.z * displacement * side);
      }
    },
    directionFor(object) {
      for (let node = object; node && node !== model; node = node.parent) {
        const part = moving.get(node);
        if (part) return part.side;
      }
      return 0;
    },
    getWorldDisplacement: (side) => worldTravel.clone().multiplyScalar(side),
  };
}

function createLinkedMotion(model, motion) {
  const axis = new Vector3().fromArray(motion.axis).normalize();
  const center = new Vector3().fromArray(motion.center);
  const up = new Vector3(0, 1, 0);
  const components = new Map(model.children.map((part) => [part.userData.label, part]));
  const rotor = components.get('Center Encoder Rotor');
  const rotorRest = rotor.quaternion.clone();
  const [closedAngle, openAngle] = motion.angle;
  const [closedWidth, openWidth] = motion.opening;
  const moving = new Map();
  const leads = [];
  const joints = motion.joints.map((joint) => ({
    ...joint,
    jawPin: new Vector3().fromArray(joint.jawPin),
    link: components.get(joint.name + ' Parallel Drive Link'),
    pin: components.get(joint.name + ' Rotor Pivot Shoulder Pin'),
  }));
  const worldUnit = model.localToWorld(axis.clone()).sub(model.localToWorld(new Vector3()));
  model.updateMatrixWorld(true);
  for (const part of model.children) {
    const side = part.userData.motion;
    if (side === -1 || side === 1) moving.set(part, { side, assembled: part.position.clone() });
    const lead = part.userData.flexibleLead;
    if (!lead) continue;
    const from = model.localToWorld(new Vector3().fromArray(lead.movingEnd));
    const to = model.localToWorld(new Vector3().fromArray(lead.fixedEnd));
    const length = to.sub(from).dot(worldUnit);
    leads.push({ side: lead.side, deform: flexibleLead(part,
      (position) => 1 - position.sub(from).dot(worldUnit) / length) });
  }

  function solve(angle) {
    const crank = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    return joints.map((joint) => {
      const inner = center.clone().addScaledVector(crank, joint.crankX);
      const delta = joint.jawPin.clone().sub(inner);
      delta.y = 0;
      const along = delta.dot(axis);
      const normal = delta.addScaledVector(axis, -along);
      const slide = joint.side * Math.sqrt(Math.max(0, motion.linkLength ** 2 - normal.lengthSq())) - along;
      const outer = joint.jawPin.clone().addScaledVector(axis, slide);
      return { inner, outer, slide };
    });
  }

  const closed = solve(closedAngle);
  const open = solve(openAngle);
  const widthDifference = (state) => state[0].slide - state[1].slide;
  const rotation = new Quaternion();
  const basis = new Matrix4();
  return {
    initialOpening: motion.initialOpening,
    openingWidth: (opening) => closedWidth + opening * (openWidth - closedWidth),
    movableObjects: [...moving.keys(), rotor, ...joints.flatMap(({ link, pin }) => [link, pin])],
    setOpening(opening) {
      let lower = openAngle;
      let upper = closedAngle;
      const target = widthDifference(closed) + opening * (widthDifference(open) - widthDifference(closed));
      for (let iteration = 0; iteration < 30; iteration += 1) {
        const angle = (lower + upper) / 2;
        if (widthDifference(solve(angle)) > target) lower = angle;
        else upper = angle;
      }
      const angle = opening === motion.initialOpening ? motion.restAngle : (lower + upper) / 2;
      const state = solve(angle);
      rotor.quaternion.copy(rotation.setFromAxisAngle(up, motion.restAngle - angle)).multiply(rotorRest);
      const offsets = new Map();
      joints.forEach(({ side, restOffset, link, pin }, index) => {
        const { inner, outer, slide } = state[index];
        const direction = outer.sub(inner);
        direction.y = 0;
        direction.normalize();
        link.position.x = inner.x;
        link.position.z = inner.z;
        link.quaternion.setFromRotationMatrix(basis.makeBasis(direction, up, direction.clone().cross(up)));
        pin.position.x = inner.x;
        pin.position.z = inner.z;
        offsets.set(side, slide - restOffset);
      });
      for (const [part, { side, assembled }] of moving) {
        part.position.copy(assembled).addScaledVector(axis, offsets.get(side));
      }
      for (const { deform, side } of leads) {
        deform(worldUnit.x * offsets.get(side), worldUnit.z * offsets.get(side));
      }
    },
    directionFor(object) {
      for (let node = object; node && node !== model; node = node.parent) {
        const part = moving.get(node);
        if (part) return part.side;
      }
      return 0;
    },
    getWorldDisplacement(side) {
      const index = joints.findIndex((joint) => joint.side === side);
      return worldUnit.clone().multiplyScalar(open[index].slide - closed[index].slide);
    },
  };
}

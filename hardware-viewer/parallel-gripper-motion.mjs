import { Vector3 } from './vendor/three-cad.mjs';
import { flexibleLead } from './flexible-lead.mjs';

export function createGripperMotion(model) {
  const motion = model.userData.parallelMotion;
  if (!motion || motion.axis?.length !== 3 || motion.travel?.length !== 2 ||
      ![...motion.axis, ...motion.travel].every(Number.isFinite)) return null;

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

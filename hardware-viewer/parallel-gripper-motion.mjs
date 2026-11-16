import { Vector3 } from './vendor/three-cad.mjs';

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
  for (const part of model.children) {
    const side = part.userData.motion;
    if (side === -1 || side === 1) moving.set(part, { side, assembled: part.position.clone() });
  }
  if (![-1, 1].every((side) => [...moving.values()].some((part) => part.side === side))) return null;

  const worldOrigin = model.localToWorld(new Vector3());
  const worldTravel = model.localToWorld(axis.clone().multiplyScalar(range)).sub(worldOrigin);

  return {
    initialOpening: -minimum / range,
    movableObjects: [...moving.keys()],
    setOpening(opening) {
      const displacement = minimum + opening * range;
      for (const [part, { side, assembled }] of moving) {
        part.position.copy(assembled).addScaledVector(axis, displacement * side);
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

import { Vector3 } from "./vendor/three-cad.js";

const radiansPerDegree = Math.PI / 180;

function rotatePoint(point, pivot, axis, angle) {
  return point.clone().sub(pivot).applyAxisAngle(axis, angle).add(pivot);
}

function projected(point, axis) {
  return point.clone().addScaledVector(axis, -point.dot(axis));
}

function findFollower(fixed, driven, followerLength, carrierLength, axis, branch) {
  const centerLine = driven.clone().sub(fixed);
  const distance = centerLine.length();
  if (distance < 1e-8) return null;
  const along = (followerLength ** 2 - carrierLength ** 2 + distance ** 2) / (2 * distance);
  const heightSquared = followerLength ** 2 - along ** 2;
  if (heightSquared < -1e-10) return null;
  centerLine.divideScalar(distance);
  const perpendicular = new Vector3().crossVectors(axis, centerLine);
  return fixed.clone().addScaledVector(centerLine, along)
    .addScaledVector(perpendicular, branch * Math.sqrt(Math.max(0, heightSquared)));
}

function signedAngle(from, to, axis) {
  return Math.atan2(axis.dot(new Vector3().crossVectors(from, to)), from.dot(to));
}

export function bindJointMotion(model, motion) {
  if (!motion?.linkages?.length || !motion.axis) return null;
  const axis = new Vector3(...motion.axis).normalize();
  const degreesToDrive = new Map();
  const homes = new Map();

  function findParts(names) {
    return (names ?? []).map((name) => {
      const part = model.getObjectByName(name);
      if (!part) throw new Error(`Joint motion is missing model node ${name}`);
      if (!homes.has(part)) homes.set(part, { position: part.position.clone(), rotation: part.quaternion.clone() });
      return part;
    });
  }

  const linkages = motion.linkages.map((spec) => {
    const [drivenPivot, followerPivot, drivenTip, followerTip] = spec.pivots
      .map((point) => projected(new Vector3(...point), axis));
    const carrierHome = followerTip.clone().sub(drivenTip);
    const followerHome = followerTip.clone().sub(followerPivot);
    const side = axis.dot(new Vector3().crossVectors(drivenTip.clone().sub(followerPivot), followerHome));
    const groups = {
      driven: findParts(spec.driven), follower: findParts(spec.follower), carrier: findParts(spec.carrier),
    };
    const dragNodes = [...groups.driven, ...groups.follower, ...groups.carrier];
    for (const node of dragNodes) degreesToDrive.set(node, { pivot: drivenPivot, ratio: spec.ratio });
    return { drivenPivot, followerPivot, drivenTip, followerTip, carrierHome, followerHome, groups,
      ratio: spec.ratio, branch: Math.sign(side) || 1 };
  });

  function move(parts, before, after, angle) {
    for (const part of parts) {
      const { position, rotation } = homes.get(part);
      part.position.copy(position).sub(before).applyAxisAngle(axis, angle).add(after);
      part.quaternion.setFromAxisAngle(axis, angle).multiply(rotation);
    }
  }

  function setAngle(degrees) {
    const poses = linkages.map((linkage) => {
      const { drivenPivot, followerPivot, drivenTip, followerHome, carrierHome, ratio, branch } = linkage;
      const drive = degrees * ratio * radiansPerDegree;
      const tip = rotatePoint(drivenTip, drivenPivot, axis, drive);
      const follower = findFollower(followerPivot, tip, followerHome.length(), carrierHome.length(), axis, branch);
      if (!follower) return null;
      return {
        drive, tip,
        follower: signedAngle(followerHome, follower.clone().sub(followerPivot), axis),
        carrier: signedAngle(carrierHome, follower.clone().sub(tip), axis),
      };
    });
    if (poses.some((pose) => !pose)) return false;
    linkages.forEach(({ drivenPivot, followerPivot, drivenTip, groups }, index) => {
      const next = poses[index];
      move(groups.driven, drivenPivot, drivenPivot, next.drive);
      move(groups.follower, followerPivot, followerPivot, next.follower);
      move(groups.carrier, drivenTip, next.tip, next.carrier);
    });
    model.updateMatrixWorld(true);
    return true;
  }

  function dragTarget(object) {
    for (let node = object; node; node = node.parent) {
      const target = degreesToDrive.get(node);
      if (target) return target;
    }
    return null;
  }

  return { axis, dragTarget, setAngle };
}

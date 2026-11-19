import { Vector3 } from './vendor/three-cad.mjs';

export function flexibleLead(group, movementAt) {
  const meshes = [];
  const world = new Vector3();
  group.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    const restPosition = mesh.geometry.attributes.position;
    const weights = new Float32Array(restPosition.count);
    for (let index = 0; index < restPosition.count; index++) {
      world.fromBufferAttribute(restPosition, index).applyMatrix4(mesh.matrixWorld);
      const weight = Math.max(0, Math.min(1, movementAt(world)));
      weights[index] = weight * weight * (3 - 2 * weight);
    }
    if (!weights.some((weight) => weight > 0)) return;
    mesh.geometry = mesh.geometry.clone();
    const position = mesh.geometry.attributes.position;
    const original = position.array.slice();
    const toLocal = mesh.matrixWorld.clone().invert();
    const origin = new Vector3().applyMatrix4(toLocal);
    const x = new Vector3(1, 0, 0).applyMatrix4(toLocal).sub(origin);
    const z = new Vector3(0, 0, 1).applyMatrix4(toLocal).sub(origin);
    meshes.push({ mesh, position, original, weights, x, z });
  });
  return (dx, dz) => {
    for (const { mesh, position, original, weights, x, z } of meshes) {
      const offset = x.clone().multiplyScalar(dx).addScaledVector(z, dz);
      const array = position.array;
      for (let n = 0; n < weights.length; n++) {
        const index = n * 3;
        const weight = weights[n];
        array[index] = original[index] + offset.x * weight;
        array[index + 1] = original[index + 1] + offset.y * weight;
        array[index + 2] = original[index + 2] + offset.z * weight;
      }
      position.needsUpdate = true;
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    }
  };
}

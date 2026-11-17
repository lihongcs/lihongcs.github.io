import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshStandardMaterial,
} from '../hardware-viewer/vendor/three-cad.mjs';

const source = {
  url: 'https://dl.vive.com/3d-files/ultimate_tracker_3d.zip',
  objSize: 22_333_734,
  objSha: '253a23c993ebfa6423436cc61c4a6b0a2668575c741d206fab2203fb7484835a',
  zipSize: 4_816_443,
  zipSha: '2ea1af0424e1a617aee495675d606cb6126aa2c2590484a23d648d3a4cf9c38a',
  vertexCount: 136_859,
  faceCount: 146_006,
  objName: 'Ultimate Tracker 3D/Ultimate Tracker_1115.obj',
};
export const viveCadDownload = source.url;

const colorGroups = {
  cap: [0.083, 0.088, 0.099, 0.0, 0.66],
  base: [0.049, 0.055, 0.064, 0.0, 0.73],
  bezel: [0.053, 0.057, 0.063, 0.1, 0.56],
  glass: [0.019, 0.033, 0.054, 0.15, 0.23],
  metal: [0.42, 0.44, 0.46, 0.76, 0.38],
  release: [0.07, 0.077, 0.084, 0.04, 0.66],
  led: [0.052, 0.45, 0.15, 0.08, 0.3],
};
const materialGroups = new Map([
  ['1', 'cap'], ['2', 'glass'], ['3', 'release'], ['6', 'led'], ['7', 'bezel'],
  ['9', 'metal'], ['10', 'metal'], ['12', 'metal'], ['13', 'metal'], ['14', 'metal'],
  ['15', 'metal'], ['16', 'metal'], ['17', 'metal'], ['19', 'release'], ['21', 'release'],
]);

async function digest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function officialObj(file) {
  if (file.size !== source.objSize && file.size !== source.zipSize) {
    throw new Error('Choose the original HTC Tracker ZIP or its OBJ.');
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === source.objSize && await digest(bytes) === source.objSha) return bytes;
  if (bytes.byteLength !== source.zipSize || await digest(bytes) !== source.zipSha) {
    throw new Error('The file does not match the HTC Tracker download.');
  }

  // The pinned manufacturer archive has an empty directory, then the OBJ at byte 50.
  const view = new DataView(bytes);
  const header = 50;
  const nameLen = view.getUint16(header + 26, true);
  const extraLen = view.getUint16(header + 28, true);
  const compressedSize = view.getUint32(header + 18, true);
  const name = new TextDecoder('utf-8', { fatal: true }).decode(
    new Uint8Array(bytes, header + 30, nameLen));
  if (view.getUint32(header, true) !== 0x04034b50 || view.getUint16(header + 8, true) !== 8 ||
      view.getUint32(header + 22, true) !== source.objSize || name !== source.objName) {
    throw new Error('The HTC archive has an unexpected OBJ entry.');
  }
  const offset = header + 30 + nameLen + extraLen;
  const compressed = new Blob([new Uint8Array(bytes, offset, compressedSize)]).stream();
  const reader = compressed.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const result = new Uint8Array(source.objSize);
  let filled = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (filled + value.byteLength > result.byteLength) {
      await reader.cancel();
      throw new Error('The HTC OBJ exceeds the data size limit.');
    }
    result.set(value, filled);
    filled += value.byteLength;
  }
  if (filled !== result.byteLength || await digest(result) !== source.objSha) {
    throw new Error('The OBJ does not match HTC’s file.');
  }
  return result;
}

function parseObj(bytes) {
  const obj = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const vertices = new Float32Array(source.vertexCount * 3);
  const normals = new Float32Array(source.vertexCount * 3);
  const groups = new Map();
  let vertexCount = 0;
  let normalCount = 0;
  let faceCount = 0;
  let materialKey = 'base';
  for (let start = 0; start < obj.length;) {
    const next = obj.indexOf('\n', start);
    const end = next < 0 ? obj.length : next;
    const line = obj.slice(start, end).trim();
    start = end + 1;
    if (line.startsWith('g ')) {
      materialKey = materialGroups.get(line.slice(2).trim()) ?? 'base';
    } else if (line.startsWith('v ') || line.startsWith('vn ')) {
      const [type, ...values] = line.split(/\s+/);
      const location = type === 'v' ? vertexCount++ : normalCount++;
      const values3 = values.map(Number);
      if (location >= source.vertexCount || values3.length !== 3 ||
          values3.some((value) => !Number.isFinite(value) || Math.abs(value) > 100)) {
        throw new Error('The HTC OBJ contains unexpected vertex data.');
      }
      (type === 'v' ? vertices : normals).set(values3, location * 3);
    } else if (line.startsWith('f ')) {
      const fields = line.slice(2).trim().split(/\s+/);
      if (fields.length !== 3 || ++faceCount > source.faceCount) {
        throw new Error('The HTC OBJ contains unexpected topology.');
      }
      if (!groups.has(materialKey)) groups.set(materialKey, []);
      const indices = groups.get(materialKey);
      for (const field of fields) {
        const [position, uv, normal] = field.split('/').map(Number);
        if (!Number.isInteger(position) || position !== uv || position !== normal ||
            position < 1 || position > source.vertexCount) {
          throw new Error('The HTC OBJ contains an invalid face index.');
        }
        indices.push(position - 1);
      }
    }
  }
  if (vertexCount !== source.vertexCount || normalCount !== source.vertexCount ||
      faceCount !== source.faceCount) {
    throw new Error('The HTC OBJ is incomplete.');
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  const indices = new Uint32Array(faceCount * 3);
  const materials = [];
  let offset = 0;
  for (const [key, group] of groups) {
    indices.set(group, offset);
    geometry.addGroup(offset, group.length, materials.length);
    offset += group.length;
    const [r, g, b, metalness, roughness] = colorGroups[key];
    const material = new MeshStandardMaterial({
      color: new Color().setRGB(r, g, b),
      metalness,
      roughness,
      side: DoubleSide,
    });
    if (key === 'led') material.emissive.setRGB(0.012, 0.08, 0.03);
    materials.push(material);
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  return new Mesh(geometry, materials);
}

export async function loadViveFactoryMesh(file) {
  const mesh = parseObj(await officialObj(file));
  // Match the centered millimeter coordinates of the published tracker mount.
  mesh.position.set(0, 0.2078515, -10.6);
  const model = new Group();
  model.name = 'VIVE Ultimate Tracker';
  model.userData.label = 'VIVE Ultimate Tracker';
  model.userData.module = 'Motion Tracking';
  model.add(mesh);
  return model;
}

import * as THREE from "three";
import { type Region } from "./colors";
import type { Block } from "./geometry";

export { BASE_COLORS, complement, hydrogenBonds, REGION_COLORS, type Region } from "./colors";

export function regionAt(blocks: Block[], pos: number): { region: Region; exon: number | null } {
  let lo = 0;
  let hi = blocks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = blocks[mid];
    if (pos < b.start) hi = mid - 1;
    else if (pos > b.end) lo = mid + 1;
    else return { region: b.kind, exon: b.exon };
  }
  return { region: "intron", exon: null };
}

export class HelixCurve extends THREE.Curve<THREE.Vector3> {
  x0: number;
  x1: number;
  radius: number;
  radPerUnit: number;
  phase: number;

  constructor(x0: number, x1: number, radius: number, radPerUnit: number, phase: number) {
    super();
    this.x0 = x0;
    this.x1 = x1;
    this.radius = radius;
    this.radPerUnit = radPerUnit;
    this.phase = phase;
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const x = this.x0 + (this.x1 - this.x0) * t;
    const a = x * this.radPerUnit + this.phase;
    return target.set(x, Math.cos(a) * this.radius, Math.sin(a) * this.radius);
  }
}

export function helixPoint(x: number, radius: number, radPerUnit: number, phase: number) {
  const a = x * radPerUnit + phase;
  return new THREE.Vector3(x, Math.cos(a) * radius, Math.sin(a) * radius);
}

export const GROOVE = THREE.MathUtils.degToRad(140);

export function colorTube(geo: THREE.TubeGeometry, colorAtU: (u: number) => THREE.Color) {
  const { tubularSegments, radialSegments } = geo.parameters;
  const colors = new Float32Array((tubularSegments + 1) * (radialSegments + 1) * 3);
  for (let i = 0; i <= tubularSegments; i++) {
    const c = colorAtU(i / tubularSegments);
    for (let j = 0; j <= radialSegments; j++) {
      const k = (i * (radialSegments + 1) + j) * 3;
      colors[k] = c.r;
      colors[k + 1] = c.g;
      colors[k + 2] = c.b;
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

const UP = new THREE.Vector3(0, 1, 0);
export function segmentMatrix(a: THREE.Vector3, b: THREE.Vector3, thickness: number, out = new THREE.Matrix4()) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return out.compose(mid, q, new THREE.Vector3(thickness, len, thickness));
}

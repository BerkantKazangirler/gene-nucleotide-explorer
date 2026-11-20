import * as THREE from "three";

const FONT = `"Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, sans-serif`;
const cache = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();

export function textTexture(text: string, color: string, weight = 600) {
  const key = `${text}|${color}|${weight}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const px = 64;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `${weight} ${px}px ${FONT}`;
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
  canvas.height = px + 16;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const entry = { texture, aspect: canvas.width / canvas.height };
  cache.set(key, entry);
  return entry;
}

export function makeTextSprite(text: string, color: string, size: number) {
  const { texture, aspect } = textTexture(text, color);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size * aspect, size, 1);
  sprite.raycast = () => {};
  return sprite;
}

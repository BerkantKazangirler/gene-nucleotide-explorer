import { useMemo } from "react";
import { textTexture } from "./textSprite";

interface LabelProps {
  text: string;
  position: [number, number, number];
  size: number;
  color?: string;
  opacity?: number;
}

/** react-three-fiber sahnesi için kameraya dönük metin. */
export function Label({ text, position, size, color = "#d9e5ea", opacity = 1 }: LabelProps) {
  const { texture, aspect } = useMemo(() => textTexture(text, color), [text, color]);
  return (
    <sprite position={position} scale={[size * aspect, size, 1]} raycast={() => null}>
      <spriteMaterial map={texture} transparent opacity={opacity} depthWrite={false} />
    </sprite>
  );
}

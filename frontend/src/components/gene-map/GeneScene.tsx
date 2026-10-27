import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Transcript } from "@/types";
import { transcriptBlocks, type HoverTarget } from "./geometry";

/** Genin 3B sahnedeki uzunluğu (birim). Her gen bu genişliğe ölçeklenir. */
const WIDTH = 22;
const LANE_GAP = 1.7;
const MIN_BLOCK = 0.06;
const MAX_LANES = 12;

const COLORS = {
  cds: "#4f8ef0",
  utr: "#3fbf73",
  intron: "#8aa1ad",
  hover: "#ff5a4e",
  label: "#d9e5ea",
};

export interface GeneSceneProps {
  length: number;
  transcripts: Transcript[];
  selectedId: string;
  hovered: HoverTarget | null;
  pinned: HoverTarget | null;
  onHover: (t: HoverTarget | null) => void;
  onPin: (t: HoverTarget) => void;
  onSelectTranscript: (id: string) => void;
}

const FOV = 38;
const TARGET = new THREE.Vector3(0, 0, -0.6);

/** Genin tamamı ekrana sığacak kamera konumu (dar ekranlarda kamera geri çekilir). */
function homePosition(aspect: number) {
  const halfW = WIDTH / 2 + 2;
  const tanH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const dist = Math.max(15, halfW / (tanH * aspect) + 1.5);
  return new THREE.Vector3(0, dist * 0.36, dist);
}

export default function GeneScene(props: GeneSceneProps) {
  const reduced = usePrefersReducedMotion();
  return (
    <Canvas
      camera={{ position: [0, 5.5, 15], fov: FOV, near: 0.1, far: 300 }}
      dpr={[1, 2]}
      onPointerMissed={() => props.onHover(null)}
      aria-label="Genin 3B haritası"
    >
      <color attach="background" args={["#10242e"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 8]} intensity={1.4} />
      <directionalLight position={[-8, 4, -6]} intensity={0.4} color="#9fc3ff" />

      <Lanes {...props} />

      <Grid
        position={[0, -1.1, 0]}
        args={[60, 60]}
        cellSize={0.5}
        cellColor="#1a3442"
        sectionSize={WIDTH / 4}
        sectionColor="#24414f"
        fadeDistance={34}
        infiniteGrid
      />
      <OrbitControls
        makeDefault
        enableDamping
        minDistance={4}
        maxDistance={80}
        maxPolarAngle={Math.PI * 0.49}
        target={TARGET}
      />
      <CameraRig animate={!reduced} />
    </Canvas>
  );
}

function Lanes({ length, transcripts, selectedId, hovered, pinned, onHover, onPin, onSelectTranscript }: GeneSceneProps) {
  const x = (pos: number) => ((pos - 1) / length) * WIDTH - WIDTH / 2;

  // Seçili transkript en önde (z = 0), diğerleri arkada katmanlar halinde
  const ordered = useMemo(() => {
    const sel = transcripts.find((t) => t.id === selectedId);
    const rest = transcripts.filter((t) => t.id !== selectedId);
    return (sel ? [sel, ...rest] : rest).slice(0, MAX_LANES);
  }, [transcripts, selectedId]);

  return (
    <group>
      {ordered.map((t, lane) => (
        <Lane
          key={t.id}
          t={t}
          z={-lane * LANE_GAP}
          active={lane === 0}
          x={x}
          hovered={hovered}
          pinned={pinned}
          onHover={onHover}
          onPin={onPin}
          onActivate={() => onSelectTranscript(t.id)}
        />
      ))}
      {/* Okuma yönü: 5' -> 3' */}
      <Label text="5′" position={[-WIDTH / 2 - 0.9, 0, 0]} size={0.5} />
      <mesh position={[WIDTH / 2 + 0.55, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.22, 0.5, 24]} />
        <meshStandardMaterial color={COLORS.intron} />
      </mesh>
      <Label text="3′" position={[WIDTH / 2 + 1.25, 0, 0]} size={0.5} />
    </group>
  );
}

interface LaneProps {
  t: Transcript;
  z: number;
  active: boolean;
  x: (pos: number) => number;
  hovered: HoverTarget | null;
  pinned: HoverTarget | null;
  onHover: (t: HoverTarget | null) => void;
  onPin: (t: HoverTarget) => void;
  onActivate: () => void;
}

function Lane({ t, z, active, x, hovered, pinned, onHover, onPin, onActivate }: LaneProps) {
  const blocks = useMemo(() => transcriptBlocks(t), [t]);
  const first = t.exons[0].start;
  const last = t.exons[t.exons.length - 1].end + 1;
  const showLabels = active && t.exons.length <= 30;
  const opacity = active ? 1 : 0.28;

  const isHot = (exon: number) =>
    (hovered?.transcriptId === t.id && hovered.exon === exon) || (pinned?.transcriptId === t.id && pinned.exon === exon);

  return (
    <group position={[0, 0, z]}>
      {active ? (
        <Helix from={x(first)} to={x(last)} />
      ) : (
        <mesh position={[(x(first) + x(last)) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, x(last) - x(first), 8]} />
          <meshStandardMaterial color={COLORS.intron} transparent opacity={opacity} />
        </mesh>
      )}

      {blocks.map((b, i) => {
        const x0 = x(b.start);
        const w = Math.max(x(b.end + 1) - x0, MIN_BLOCK);
        const hot = isHot(b.exon);
        const radius = (b.kind === "cds" ? 0.42 : 0.27) * (hot ? 1.18 : 1);
        return (
          <mesh
            key={i}
            position={[x0 + w / 2, 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = "pointer";
              onHover({ transcriptId: t.id, exon: b.exon });
            }}
            onPointerOut={() => {
              document.body.style.cursor = "";
              onHover(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!active) onActivate();
              onPin({ transcriptId: t.id, exon: b.exon });
            }}
          >
            <cylinderGeometry args={[radius, radius, w, 28]} />
            <meshStandardMaterial
              color={hot ? COLORS.hover : b.kind === "cds" ? COLORS.cds : COLORS.utr}
              roughness={0.45}
              metalness={0.05}
              transparent={!active}
              opacity={opacity}
            />
          </mesh>
        );
      })}

      {showLabels &&
        t.exons.map((e) => (
          <Label
            key={e.number}
            text={String(e.number)}
            position={[x((e.start + e.end) / 2), 0.8, 0]}
            size={0.34}
            color={isHot(e.number) ? COLORS.hover : COLORS.label}
          />
        ))}
    </group>
  );
}

/** İntronların üzerinden geçen ince çift sarmal: DNA'nın tamamının ekzonlardan ibaret olmadığını hatırlatır. */
function Helix({ from, to }: { from: number; to: number }) {
  const geos = useMemo(() => {
    const span = to - from;
    const turns = Math.max(4, Math.round(span / 0.7));
    const steps = turns * 18;
    const make = (phase: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const a = u * turns * Math.PI * 2 + phase;
        pts.push(new THREE.Vector3(from + u * span, Math.cos(a) * 0.13, Math.sin(a) * 0.13));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, 0.022, 6, false);
    };
    return [make(0), make(Math.PI)];
  }, [from, to]);

  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);

  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color={COLORS.intron} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Kamerayı genin tamamını gösterecek konuma yerleştirir. Sayfa açılışındaki tek animasyon da burada:
 * kamera yandan süzülerek genin önüne gelir (hareket azaltma tercihi varsa doğrudan yerleşir).
 */
function CameraRig({ animate }: { animate: boolean }) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const t = useRef(animate ? 0 : 1);
  const from = useMemo(() => new THREE.Vector3(-18, 2.2, 6), []);
  const to = useMemo(() => homePosition(aspect), [aspect]);

  useEffect(() => {
    camera.position.copy(t.current < 1 ? from : to);
    camera.lookAt(TARGET);
  }, [camera, from, to]);

  useFrame((_, dt) => {
    if (t.current >= 1) return;
    t.current = Math.min(1, t.current + dt / 1.6);
    const k = 1 - Math.pow(1 - t.current, 3);
    camera.position.lerpVectors(from, to, k);
    camera.lookAt(TARGET);
  });

  // Sis, kameranın uzaklığına göre ayarlanır: arka transkriptler ve zemin ızgarası hafifçe kaybolur
  const d = to.distanceTo(TARGET);
  return <fog attach="fog" args={["#10242e", d * 1.1, d * 2.6]} />;
}

/** Kameraya dönük metin: canvas'a yazılan yazı, sahnenin içinde bir sprite olarak gösterilir. */
function Label({
  text,
  position,
  size,
  color = COLORS.label,
}: {
  text: string;
  position: [number, number, number];
  size: number;
  color?: string;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    const px = 64;
    const ctx = canvas.getContext("2d")!;
    const font = `600 ${px}px "Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, sans-serif`;
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
    canvas.height = px + 16;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { tex, aspect: canvas.width / canvas.height };
  }, [text, color]);

  useEffect(() => () => texture.tex.dispose(), [texture]);

  return (
    <sprite position={position} scale={[size * texture.aspect, size, 1]} raycast={() => null}>
      <spriteMaterial map={texture.tex} transparent depthWrite={false} />
    </sprite>
  );
}

function usePrefersReducedMotion() {
  const [reduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  return reduced;
}

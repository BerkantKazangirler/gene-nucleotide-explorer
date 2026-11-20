import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Transcript } from "@/types";
import { formatNumber } from "@/utils/format";
import { transcriptBlocks, type Block, type HoverTarget } from "./geometry";
import {
  BASE_COLORS,
  colorTube,
  complement,
  GROOVE,
  HelixCurve,
  helixPoint,
  REGION_COLORS,
  regionAt,
  segmentMatrix,
  type Region,
} from "./helix";
import { Label } from "./labels";

export interface BaseWindow {
  start: number;
  end: number;
  sequence: string;
}

export interface BaseHover {
  pos: number;
  base: string;
  pair: string;
  region: Region;
  exon: number | null;
}

export interface GeneSceneProps {
  length: number;
  transcript: Transcript;
  hovered: HoverTarget | null;
  pinned: HoverTarget | null;
  onHover: (t: HoverTarget | null) => void;
  onPin: (t: HoverTarget) => void;
  /** Doluysa sahne gerçek baz çiftlerini gösteren yakın görünüme geçer. */
  bases: BaseWindow | null;
  onHoverBase: (b: BaseHover | null) => void;
}

const FOV = 36;
const BG = "#10242e";

export default function GeneScene(props: GeneSceneProps) {
  const reduced = usePrefersReducedMotion();
  const blocks = useMemo(() => transcriptBlocks(props.transcript), [props.transcript]);
  const width = props.bases ? props.bases.sequence.length * BASE_RISE : OVERVIEW_WIDTH;

  return (
    <Canvas
      camera={{ position: [-20, 3, 8], fov: FOV, near: 0.1, far: 400 }}
      dpr={[1, 2]}
      onPointerMissed={() => {
        props.onHover(null);
        props.onHoverBase(null);
      }}
      aria-label={props.bases ? "Seçilen bölgenin baz çiftleri" : "Genin 3B çift sarmal haritası"}
    >
      <color attach="background" args={[BG]} />
      <hemisphereLight args={["#cfe3ff", "#0b1a22", 0.7]} />
      <directionalLight position={[6, 10, 8]} intensity={1.6} />
      <directionalLight position={[-8, -4, -6]} intensity={0.5} color="#8fb6ff" />

      {props.bases ? (
        <BasesHelix window={props.bases} blocks={blocks} onHoverBase={props.onHoverBase} />
      ) : (
        <OverviewHelix {...props} blocks={blocks} />
      )}

      <OrbitControls makeDefault enableDamping minDistance={3} maxDistance={90} target={[0, 0, 0]} />
      <CameraRig width={width} animate={!reduced} flyKey={props.bases ? `b${props.bases.start}` : "overview"} />
    </Canvas>
  );
}

/* -------------------------------------------------------------------------- */
/* Genel bakış: genin tamamı tek bir çift sarmal                              */
/* -------------------------------------------------------------------------- */

const OVERVIEW_WIDTH = 24;
const O_RADIUS = 0.85;
const O_TWIST = (Math.PI * 2) / 2.1; // her 2,1 birimde bir tam tur (görsel; gerçek ölçek değil)
const MIN_EXON_WIDTH = 0.3;

interface Rung {
  x: number;
  pos: number;
  region: Region;
  exon: number | null;
}

function OverviewHelix({
  length,
  transcript,
  blocks,
  hovered,
  pinned,
  onHover,
  onPin,
}: GeneSceneProps & { blocks: Block[] }) {
  const W = OVERVIEW_WIDTH;
  const xOf = (pos: number) => ((pos - 1) / length) * W - W / 2;

  const hotExon =
    hovered?.transcriptId === transcript.id ? hovered.exon : pinned?.transcriptId === transcript.id ? pinned.exon : null;

  // Basamaklar: intronlarda seyrek, ekzonlarda sık. Kısa ekzonlar da en az 3 basamakla görünür.
  const rungs = useMemo<Rung[]>(() => {
    const out: Rung[] = [];
    const spans = transcript.exons.map((e) => {
      const x0 = ((e.start - 1) / length) * W - W / 2;
      const x1 = (e.end / length) * W - W / 2;
      const mid = (x0 + x1) / 2;
      const w = Math.max(x1 - x0, MIN_EXON_WIDTH);
      return { e, a: mid - w / 2, b: mid + w / 2 };
    });
    for (let x = -W / 2; x <= W / 2; x += 0.14) {
      if (spans.some((s) => x > s.a - 0.06 && x < s.b + 0.06)) continue;
      const pos = Math.round(((x + W / 2) / W) * length) + 1;
      out.push({ x, pos, region: "intron", exon: null });
    }
    for (const s of spans) {
      const n = Math.max(3, Math.round((s.b - s.a) / 0.07));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const pos = Math.round(s.e.start + u * (s.e.end - s.e.start));
        const r = regionAt(blocks, pos);
        out.push({ x: s.a + u * (s.b - s.a), pos, region: r.region, exon: s.e.number });
      }
    }
    return out.sort((p, q) => p.x - q.x);
  }, [transcript, blocks, length, W]);

  const curveA = useMemo(() => new HelixCurve(-W / 2, W / 2, O_RADIUS, O_TWIST, 0), [W]);
  const curveB = useMemo(() => new HelixCurve(-W / 2, W / 2, O_RADIUS, O_TWIST, GROOVE), [W]);

  // Omurga rengi x konumuna göre: ekzon bölgeleri parlak, intronlar sönük
  const backboneColor = useMemo(() => {
    const colors = {
      cds: new THREE.Color(REGION_COLORS.cds),
      utr: new THREE.Color(REGION_COLORS.utr),
      intron: new THREE.Color(REGION_COLORS.intronLine),
      hot: new THREE.Color(REGION_COLORS.hover),
    };
    // Çok kısa ekzonlar tüp çözünürlüğünde kaybolmasın diye en az MIN_EXON_WIDTH genişlikte boyanır
    const spans = transcript.exons.map((e) => {
      const a = ((e.start - 1) / length) * W - W / 2;
      const b = (e.end / length) * W - W / 2;
      const mid = (a + b) / 2;
      const w = Math.max(b - a, MIN_EXON_WIDTH);
      const coding = blocks.some((bl) => bl.exon === e.number && bl.kind === "cds");
      return { n: e.number, a: mid - w / 2, b: mid + w / 2, kind: coding ? ("cds" as const) : ("utr" as const) };
    });
    return (u: number) => {
      const x = -W / 2 + u * W;
      const span = spans.find((s) => x >= s.a && x <= s.b);
      if (!span) return colors.intron;
      if (span.n === hotExon) return colors.hot;
      const pos = Math.round(((x + W / 2) / W) * length) + 1;
      const r = regionAt(blocks, pos);
      // Ekzonun içindeysek tam bölgeyi (CDS/UTR), genişletilmiş kenarındaysak ekzonun baskın türünü kullan
      return r.exon === span.n && r.region !== "intron" ? colors[r.region] : colors[span.kind];
    };
  }, [transcript, blocks, length, W, hotExon]);

  const tubeA = useRef<THREE.Mesh>(null);
  const tubeB = useRef<THREE.Mesh>(null);
  useLayoutEffect(() => {
    for (const m of [tubeA.current, tubeB.current]) {
      if (m) colorTube(m.geometry as THREE.TubeGeometry, backboneColor);
    }
  }, [backboneColor]);

  const rungMesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = rungMesh.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    rungs.forEach((r, i) => {
      const a = helixPoint(r.x, O_RADIUS, O_TWIST, 0);
      const b = helixPoint(r.x, O_RADIUS, O_TWIST, GROOVE);
      mesh.setMatrixAt(i, segmentMatrix(a, b, r.exon != null ? 1.4 : 0.8, m));
      const hex = r.exon != null && r.exon === hotExon ? REGION_COLORS.hover : r.region === "intron" ? REGION_COLORS.intron : REGION_COLORS[r.region];
      mesh.setColorAt(i, c.set(hex));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [rungs, hotExon]);

  const showLabels = transcript.exons.length <= 40;

  return (
    <group>
      <mesh ref={tubeA}>
        <tubeGeometry args={[curveA, 1200, 0.07, 8, false]} />
        <meshStandardMaterial vertexColors roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh ref={tubeB}>
        <tubeGeometry args={[curveB, 1200, 0.07, 8, false]} />
        <meshStandardMaterial vertexColors roughness={0.35} metalness={0.1} />
      </mesh>
      <instancedMesh key={rungs.length} ref={rungMesh} args={[undefined, undefined, rungs.length]} raycast={() => null}>
        <cylinderGeometry args={[0.035, 0.035, 1, 6]} />
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>

      {/* Ekzonlar için görünmez tıklama alanları + seçili ekzonun hafif parıltısı */}
      {transcript.exons.map((e) => {
        const mid = (xOf(e.start) + xOf(e.end + 1)) / 2;
        const w = Math.max(xOf(e.end + 1) - xOf(e.start), MIN_EXON_WIDTH);
        const hot = e.number === hotExon;
        return (
          <mesh
            key={e.number}
            position={[mid, 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
            onPointerOver={(ev: ThreeEvent<PointerEvent>) => {
              ev.stopPropagation();
              document.body.style.cursor = "pointer";
              onHover({ transcriptId: transcript.id, exon: e.number });
            }}
            onPointerOut={() => {
              document.body.style.cursor = "";
              onHover(null);
            }}
            onClick={(ev: ThreeEvent<MouseEvent>) => {
              ev.stopPropagation();
              onPin({ transcriptId: transcript.id, exon: e.number });
            }}
          >
            <cylinderGeometry args={[O_RADIUS + 0.28, O_RADIUS + 0.28, w + 0.06, 32, 1, true]} />
            <meshBasicMaterial
              color={REGION_COLORS.hover}
              transparent
              opacity={hot ? 0.13 : 0}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}

      {showLabels &&
        transcript.exons.map((e) => (
          <Label
            key={e.number}
            text={String(e.number)}
            position={[(xOf(e.start) + xOf(e.end + 1)) / 2, O_RADIUS + 0.75, 0]}
            size={0.36}
            color={e.number === hotExon ? REGION_COLORS.hover : REGION_COLORS.label}
          />
        ))}

      <Label text="5′" position={[-W / 2 - 0.9, 0, 0]} size={0.55} />
      <Label text="3′" position={[W / 2 + 0.9, 0, 0]} size={0.55} />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Yakın görünüm: gerçek dizi, her basamak bir baz çifti                       */
/* -------------------------------------------------------------------------- */

const BASE_RISE = 0.22; // komşu baz çiftleri arası (gerçekte 0,34 nm)
const B_RADIUS = 1.0;
const B_TWIST = (Math.PI * 2) / (10.5 * BASE_RISE); // B-DNA: tur başına ~10,5 baz çifti

function BasesHelix({
  window: win,
  blocks,
  onHoverBase,
}: {
  window: BaseWindow;
  blocks: Block[];
  onHoverBase: (b: BaseHover | null) => void;
}) {
  const seq = win.sequence.toUpperCase();
  const n = seq.length;
  const xAt = (i: number) => (i - (n - 1) / 2) * BASE_RISE;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const info = useMemo(
    () =>
      Array.from(seq, (base, i) => {
        const pos = win.start + i;
        const r = regionAt(blocks, pos);
        return { pos, base, pair: complement(base), region: r.region, exon: r.exon };
      }),
    [seq, win.start, blocks],
  );

  const x0 = xAt(0) - BASE_RISE / 2;
  const x1 = xAt(n - 1) + BASE_RISE / 2;
  const curveA = useMemo(() => new HelixCurve(x0, x1, B_RADIUS, B_TWIST, 0), [x0, x1]);
  const curveB = useMemo(() => new HelixCurve(x0, x1, B_RADIUS, B_TWIST, GROOVE), [x0, x1]);

  const tubeA = useRef<THREE.Mesh>(null);
  const tubeB = useRef<THREE.Mesh>(null);
  useLayoutEffect(() => {
    const colors = {
      cds: new THREE.Color(REGION_COLORS.cds),
      utr: new THREE.Color(REGION_COLORS.utr),
      intron: new THREE.Color(REGION_COLORS.intronLine),
    };
    const at = (u: number) => {
      const i = Math.min(n - 1, Math.max(0, Math.round(u * n - 0.5)));
      return colors[info[i].region];
    };
    for (const m of [tubeA.current, tubeB.current]) if (m) colorTube(m.geometry as THREE.TubeGeometry, at);
  }, [info, n]);

  const halfA = useRef<THREE.InstancedMesh>(null);
  const halfB = useRef<THREE.InstancedMesh>(null);
  const phosphates = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const white = new THREE.Color("#ffffff");
    info.forEach((b, i) => {
      const x = xAt(i);
      const pA = helixPoint(x, B_RADIUS, B_TWIST, 0);
      const pB = helixPoint(x, B_RADIUS, B_TWIST, GROOVE);
      const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
      const gap = new THREE.Vector3().subVectors(pB, pA).normalize().multiplyScalar(0.03);
      const hot = i === hoverIdx;
      halfA.current?.setMatrixAt(i, segmentMatrix(pA, mid.clone().sub(gap), hot ? 2.6 : 2, m));
      halfA.current?.setColorAt(i, c.set(BASE_COLORS[b.base] ?? BASE_COLORS.N).lerp(white, hot ? 0.35 : 0));
      halfB.current?.setMatrixAt(i, segmentMatrix(mid.clone().add(gap), pB, hot ? 2.6 : 2, m));
      halfB.current?.setColorAt(i, c.set(BASE_COLORS[b.pair] ?? BASE_COLORS.N).lerp(white, hot ? 0.35 : 0));
      phosphates.current?.setMatrixAt(2 * i, m.makeTranslation(pA.x, pA.y, pA.z));
      phosphates.current?.setMatrixAt(2 * i + 1, m.makeTranslation(pB.x, pB.y, pB.z));
    });
    for (const mesh of [halfA.current, halfB.current, phosphates.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // xAt n'e bağlı; n info'dan türetiliyor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, hoverIdx]);

  // Bölge etiketleri: "Ekzon 3 (CDS)", "İntron" gibi ardışık parçalar
  const runs = useMemo(() => {
    const out: { from: number; to: number; text: string; color: string }[] = [];
    info.forEach((b, i) => {
      const text = b.exon != null ? `Ekzon ${b.exon}${b.region === "cds" ? " (CDS)" : " (UTR)"}` : "İntron";
      const last = out[out.length - 1];
      if (last && last.text === text) last.to = i;
      else out.push({ from: i, to: i, text, color: b.region === "intron" ? REGION_COLORS.intronLine : REGION_COLORS[b.region] });
    });
    return out;
  }, [info]);

  const move = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId == null) return;
    setHoverIdx(e.instanceId);
    onHoverBase(info[e.instanceId]);
    document.body.style.cursor = "crosshair";
  };
  const leave = () => {
    setHoverIdx(null);
    onHoverBase(null);
    document.body.style.cursor = "";
  };

  return (
    <group>
      <mesh ref={tubeA}>
        <tubeGeometry args={[curveA, n * 8, 0.09, 10, false]} />
        <meshStandardMaterial vertexColors roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh ref={tubeB}>
        <tubeGeometry args={[curveB, n * 8, 0.09, 10, false]} />
        <meshStandardMaterial vertexColors roughness={0.35} metalness={0.1} />
      </mesh>
      <instancedMesh key={`p${n}`} ref={phosphates} args={[undefined, undefined, n * 2]} raycast={() => null}>
        <sphereGeometry args={[0.13, 14, 10]} />
        <meshStandardMaterial color="#c9d6dc" roughness={0.4} />
      </instancedMesh>
      <instancedMesh key={`a${n}`} ref={halfA} args={[undefined, undefined, n]} onPointerMove={move} onPointerOut={leave}>
        <cylinderGeometry args={[0.04, 0.04, 1, 8]} />
        <meshStandardMaterial roughness={0.45} />
      </instancedMesh>
      <instancedMesh key={`b${n}`} ref={halfB} args={[undefined, undefined, n]} onPointerMove={move} onPointerOut={leave}>
        <cylinderGeometry args={[0.04, 0.04, 1, 8]} />
        <meshStandardMaterial roughness={0.45} />
      </instancedMesh>

      {/* Baz harfleri, omurganın hemen dışında */}
      {info.map((b, i) => {
        const pa = helixPoint(xAt(i), B_RADIUS + 0.36, B_TWIST, 0);
        const pb = helixPoint(xAt(i), B_RADIUS + 0.36, B_TWIST, GROOVE);
        return (
          <group key={i}>
            <Label text={b.base} position={[pa.x, pa.y, pa.z]} size={0.24} color={BASE_COLORS[b.base] ?? BASE_COLORS.N} />
            <Label text={b.pair} position={[pb.x, pb.y, pb.z]} size={0.24} color={BASE_COLORS[b.pair] ?? BASE_COLORS.N} opacity={0.75} />
          </group>
        );
      })}

      {/* Her 10 bazda bir konum */}
      {info.map((b, i) =>
        b.pos % 10 === 0 ? (
          <Label key={`t${i}`} text={formatNumber(b.pos)} position={[xAt(i), -B_RADIUS - 0.9, 0]} size={0.26} opacity={0.8} />
        ) : null,
      )}

      {runs.map((r) => (
        <Label
          key={`${r.from}-${r.text}`}
          text={r.text}
          position={[(xAt(r.from) + xAt(r.to)) / 2, B_RADIUS + 1.05, 0]}
          size={0.32}
          color={r.color}
        />
      ))}

      <Label text="5′" position={[x0 - 0.6, 0.4, 0]} size={0.4} />
      <Label text="3′" position={[x1 + 0.6, 0.4, 0]} size={0.4} />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Kamera                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Kamerayı sahnenin tamamını gösterecek konuma getirir. İlk açılışta yandan süzülür; genel bakış ile
 * baz çifti görünümü arasında geçerken bulunduğu yerden yeni konuma uçar. Hareket azaltma tercihi varsa
 * doğrudan yerleşir.
 */
function CameraRig({ width, animate, flyKey }: { width: number; animate: boolean; flyKey: string }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const progress = useRef(1);
  const from = useRef(new THREE.Vector3());

  const home = useMemo(() => {
    const halfW = width / 2 + 2;
    const tanH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const dist = Math.max(10, halfW / (tanH * aspect) + 1);
    return new THREE.Vector3(0, dist * 0.28, dist);
  }, [width, aspect]);

  useEffect(() => {
    if (animate) {
      from.current.copy(camera.position);
      progress.current = 0;
    } else {
      camera.position.copy(home);
      camera.lookAt(0, 0, 0);
    }
    controls?.target.set(0, 0, 0);
    // home sadece flyKey değişince ya da ekran oranı değişince yeniden uygulanır
  }, [camera, controls, home, animate, flyKey]);

  useFrame((_, dt) => {
    if (progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + dt / 1.3);
    const k = 1 - Math.pow(1 - progress.current, 3);
    camera.position.lerpVectors(from.current, home, k);
    camera.lookAt(0, 0, 0);
  });

  const d = home.length();
  return <fog attach="fog" args={[BG, d * 0.9, d * 2.4]} />;
}

function usePrefersReducedMotion() {
  const [reduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  return reduced;
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges, Html, Line, OrbitControls, RoundedBox, Sparkles } from "@react-three/drei";
import * as THREE from "three";

/*
 * Animated model of the voting pipeline, looping every LOOP seconds:
 *   0  credential  – the secret lives inside "your device"
 *   1  commitment  – it is hashed and the commitment joins the Merkle tree
 *   2  merkle      – the path from the voter's leaf to the root lights up
 *   3  on-chain    – the proof passes the verifier and a new block is added
 */
const LOOP = 8;
const STAGES = [
  [0, 1.5],
  [1.5, 4],
  [4, 5.5],
  [5.5, LOOP],
];
const stageAt = (t) => STAGES.findIndex(([a, b]) => t >= a && t < b);

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const progress = (t, a, b) => clamp01((t - a) / (b - a));
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

const C = {
  indigo: new THREE.Color("#818cf8"),
  violet: new THREE.Color("#c084fc"),
  emerald: new THREE.Color("#34d399"),
  node: new THREE.Color("#6366f1"),
};

const DEVICE = new THREE.Vector3(-3.7, 0.1, 0);
const PRISM = new THREE.Vector3(-2.05, 0.1, 0);
const SHIELD = new THREE.Vector3(2.55, 0.8, 0);
const BLOCKS = [2.15, 2.8, 3.45, 4.1].map((x) => new THREE.Vector3(x, -0.95, 0));
const NEW_BLOCK = BLOCKS[3];

const LEVEL_Y = [-1.4, -0.45, 0.5, 1.45];
const VOTER_LEAF = 2;

function buildTree() {
  const levels = [
    Array.from({ length: 8 }, (_, i) => new THREE.Vector3(-1.0 + i * 0.36, LEVEL_Y[0], ((i % 4) - 1.5) * 0.18)),
  ];
  for (let l = 1; l < LEVEL_Y.length; l++) {
    const prev = levels[l - 1];
    levels.push(
      Array.from({ length: prev.length / 2 }, (_, i) => {
        const a = prev[2 * i];
        const b = prev[2 * i + 1];
        return new THREE.Vector3((a.x + b.x) / 2, LEVEL_Y[l], (a.z + b.z) / 2);
      })
    );
  }
  return levels;
}

const TREE = buildTree();
const ROOT = TREE[3][0];
const LEAF = TREE[0][VOTER_LEAF];
const onPath = (level, index) => index === VOTER_LEAF >> level;
const isSibling = (level, index) => level < 3 && index === ((VOTER_LEAF >> level) ^ 1);
const litAt = (level) => 4 + level * 0.4;

// How strongly a stage glows: full when active, dimmed otherwise (more so while the user hovers a step).
function emphasis(state, stage) {
  if (state.active === stage) return 1;
  return state.hover != null ? 0.15 : 0.45;
}

// three.js objects are mutated every frame; these helpers keep that out of hook bodies.
const SCRATCH = new THREE.Vector3();

function dampGlow(material, target, dt) {
  material.emissiveIntensity = THREE.MathUtils.damp(material.emissiveIntensity, target, 6, dt);
}

function arcBetween(from, to, p, height) {
  SCRATCH.lerpVectors(from, to, p);
  SCRATCH.y += Math.sin(Math.PI * p) * height;
  return SCRATCH;
}

// Collects materials so a stage can fade its emissive glow in and out together.
function useStageGlow(stage, stateRef, base = 1) {
  const mats = useRef([]);
  const register = useCallback((m) => {
    if (m && !mats.current.includes(m)) mats.current.push(m);
  }, []);

  useFrame((_, dt) => {
    const target = emphasis(stateRef.current, stage) * base;
    mats.current.forEach((m) => dampGlow(m, target, dt));
  });

  return register;
}

function Label({ position, children }) {
  return (
    <Html center position={position} className="pointer-events-none select-none">
      <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {children}
      </span>
    </Html>
  );
}

function Device({ stateRef }) {
  const glow = useStageGlow(0, stateRef, 1.4);
  const key = useRef();

  useFrame((state) => {
    if (key.current) key.current.rotation.y = state.clock.elapsedTime * 0.8;
  });

  return (
    <group position={DEVICE}>
      <mesh>
        <sphereGeometry args={[0.72, 48, 48]} />
        <meshStandardMaterial color="#6366f1" transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.73, 1]} />
        <meshBasicMaterial color="#818cf8" wireframe transparent opacity={0.18} />
      </mesh>
      <group ref={key} rotation={[0, 0, Math.PI / 5]}>
        <mesh position={[-0.22, 0, 0]}>
          <torusGeometry args={[0.16, 0.05, 16, 32]} />
          <meshStandardMaterial ref={glow} color="#c4b5fd" emissive={C.violet} emissiveIntensity={1} />
        </mesh>
        <mesh position={[0.12, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 0.5, 12]} />
          <meshStandardMaterial ref={glow} color="#c4b5fd" emissive={C.violet} emissiveIntensity={1} />
        </mesh>
        {[0.22, 0.32].map((x) => (
          <mesh key={x} position={[x, -0.08, 0]}>
            <boxGeometry args={[0.05, 0.12, 0.05]} />
            <meshStandardMaterial ref={glow} color="#c4b5fd" emissive={C.violet} emissiveIntensity={1} />
          </mesh>
        ))}
      </group>
      <Label position={[0, -1.0, 0]}>Your device</Label>
    </group>
  );
}

function Prism({ stateRef }) {
  const glow = useStageGlow(1, stateRef, 1.2);
  const mesh = useRef();

  useFrame((_, dt) => {
    const { t } = stateRef.current;
    const hashing = t > 2.4 && t < 3.1;
    if (mesh.current) mesh.current.rotation.y += dt * (hashing ? 6 : 0.6);
  });

  return (
    <group position={PRISM}>
      <mesh ref={mesh}>
        <cylinderGeometry args={[0.42, 0.42, 0.85, 3]} />
        <meshStandardMaterial
          ref={glow}
          color="#4f46e5"
          emissive={C.indigo}
          emissiveIntensity={0.5}
          transparent
          opacity={0.55}
        />
        <Edges color="#a5b4fc" />
      </mesh>
      <Label position={[0, -1.0, 0]}>Hash</Label>
    </group>
  );
}

function Tree({ stateRef }) {
  const nodeMats = useRef({});
  const pathLines = useRef([]);
  const placeholder = useRef();

  const edges = useMemo(() => {
    const base = [];
    const path = [];
    for (let l = 1; l < TREE.length; l++) {
      TREE[l].forEach((parent, i) => {
        [2 * i, 2 * i + 1].forEach((c) => {
          const child = TREE[l - 1][c];
          if (onPath(l, i) && onPath(l - 1, c)) path.push({ level: l, points: [child, parent] });
          else base.push(child, parent);
        });
      });
    }
    return { base, path };
  }, []);

  useFrame(() => {
    const state = stateRef.current;
    const { t } = state;
    const dim = emphasis(state, 2);

    TREE.forEach((nodes, l) =>
      nodes.forEach((_, i) => {
        const m = nodeMats.current[`${l}-${i}`];
        if (!m) return;
        const lit = t >= litAt(l);
        if (onPath(l, i) && lit) {
          m.emissive.copy(C.emerald);
          m.emissiveIntensity = 1.6;
        } else if (isSibling(l, i) && lit) {
          m.emissive.copy(C.violet);
          m.emissiveIntensity = 1.1;
        } else {
          m.emissive.copy(C.node);
          m.emissiveIntensity = 0.25 + dim * 0.5;
        }
      })
    );

    if (placeholder.current) placeholder.current.visible = t < 4;

    pathLines.current.forEach((line, k) => {
      if (line) line.material.opacity = t >= litAt(edges.path[k].level) ? 1 : 0;
    });
  });

  return (
    <group>
      <Line segments points={edges.base} color="#475569" lineWidth={1} transparent opacity={0.7} />
      {edges.path.map((edge, k) => (
        <Line
          key={k}
          ref={(el) => (pathLines.current[k] = el)}
          points={edge.points}
          color="#34d399"
          lineWidth={2.5}
          transparent
          opacity={0}
        />
      ))}

      {TREE.map((nodes, l) =>
        nodes.map((p, i) => {
          // The voter's own leaf is the commitment cube flown in by <Commitment />.
          if (l === 0 && i === VOTER_LEAF) return null;
          const ref = (m) => (nodeMats.current[`${l}-${i}`] = m);
          return (
            <mesh key={`${l}-${i}`} position={p}>
              {l === 0 ? (
                <boxGeometry args={[0.2, 0.2, 0.2]} />
              ) : (
                <sphereGeometry args={[l === 3 ? 0.17 : 0.11, 24, 24]} />
              )}
              <meshStandardMaterial ref={ref} color="#334155" emissive={C.node} emissiveIntensity={0.5} />
            </mesh>
          );
        })
      )}

      <mesh ref={placeholder} position={LEAF}>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshBasicMaterial color="#64748b" wireframe transparent opacity={0.5} />
      </mesh>

      <Label position={[ROOT.x, -2.0, 0]}>Merkle tree</Label>
    </group>
  );
}

// The secret particle travelling into the hash, and the commitment cube it becomes.
function Commitment({ stateRef }) {
  const secret = useRef();
  const cube = useRef();

  useFrame((state) => {
    const { t } = stateRef.current;

    if (secret.current) {
      const p = progress(t, 1.5, 2.5);
      secret.current.visible = t >= 1.5 && t < 2.5;
      secret.current.position.lerpVectors(DEVICE, PRISM, ease(p));
    }

    if (cube.current) {
      const p = ease(progress(t, 3, 4));
      cube.current.visible = t >= 3;
      cube.current.position.copy(arcBetween(PRISM, LEAF, p, 0.7));
      cube.current.rotation.set(p * Math.PI * 2, p * Math.PI, 0);
      cube.current.scale.setScalar(0.5 + 0.5 * progress(t, 3, 3.3) + Math.sin(state.clock.elapsedTime * 4) * 0.03);
    }
  });

  return (
    <>
      <mesh ref={secret} visible={false}>
        <sphereGeometry args={[0.1, 20, 20]} />
        <meshStandardMaterial color="#e9d5ff" emissive={C.violet} emissiveIntensity={2.2} />
      </mesh>
      <mesh ref={cube} visible={false}>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshStandardMaterial color="#d1fae5" emissive={C.emerald} emissiveIntensity={1.6} />
      </mesh>
    </>
  );
}

function Verifier({ stateRef }) {
  const glow = useStageGlow(3, stateRef, 0.8);
  const ring = useRef();
  const badge = useRef();

  useFrame((_, dt) => {
    const { t } = stateRef.current;
    if (ring.current) ring.current.rotation.z += dt * 0.8;
    if (badge.current) {
      const verifying = t > 6.1 && t < 6.9;
      badge.current.emissive.lerp(verifying ? C.emerald : C.indigo, 1 - Math.exp(-dt * 8));
    }
  });

  return (
    <group position={SHIELD}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.12, 6]} />
        <meshStandardMaterial
          ref={(m) => {
            badge.current = m;
            glow(m);
          }}
          color="#312e81"
          emissive={C.indigo}
          emissiveIntensity={0.8}
        />
      </mesh>
      <Line
        points={[
          [-0.16, 0.0, 0.08],
          [-0.04, -0.12, 0.08],
          [0.18, 0.13, 0.08],
        ]}
        color="#a7f3d0"
        lineWidth={3}
      />
      <mesh ref={ring}>
        <torusGeometry args={[0.52, 0.02, 8, 64]} />
        <meshBasicMaterial color="#818cf8" transparent opacity={0.5} />
      </mesh>
      <Label position={[0, 0.78, 0]}>Verifier</Label>
    </group>
  );
}

function Chain({ stateRef }) {
  const glow = useStageGlow(3, stateRef, 0.7);
  const fresh = useRef();

  useFrame(() => {
    const { t } = stateRef.current;
    if (fresh.current) {
      const grow = ease(progress(t, 7.1, 7.5));
      const shrink = 1 - progress(t, 7.85, 8);
      fresh.current.scale.setScalar(Math.max(0.0001, grow * shrink));
    }
  });

  return (
    <group>
      <Line points={[BLOCKS[0], BLOCKS[3]]} color="#475569" lineWidth={1.5} />
      {BLOCKS.slice(0, 3).map((p) => (
        <RoundedBox key={p.x} args={[0.48, 0.48, 0.48]} radius={0.07} position={p}>
          <meshStandardMaterial ref={glow} color="#1e1b4b" emissive={C.indigo} emissiveIntensity={0.5} />
        </RoundedBox>
      ))}
      <group ref={fresh} position={NEW_BLOCK} scale={0.0001}>
        <RoundedBox args={[0.48, 0.48, 0.48]} radius={0.07}>
          <meshStandardMaterial color="#064e3b" emissive={C.emerald} emissiveIntensity={1.2} />
        </RoundedBox>
      </group>
      <Label position={[3.12, -1.6, 0]}>Blockchain</Label>
    </group>
  );
}

// The proof pulse: root → verifier, then verifier → the new block.
function ProofPulse({ stateRef }) {
  const pulse = useRef();

  useFrame(() => {
    const { t } = stateRef.current;
    const m = pulse.current;
    if (!m) return;

    if (t >= 5.5 && t < 6.3) {
      m.visible = true;
      m.position.lerpVectors(ROOT, SHIELD, ease(progress(t, 5.5, 6.3)));
    } else if (t >= 6.6 && t < 7.3) {
      m.visible = true;
      m.position.lerpVectors(SHIELD, NEW_BLOCK, ease(progress(t, 6.6, 7.3)));
    } else {
      m.visible = false;
    }
  });

  return (
    <mesh ref={pulse} visible={false}>
      <sphereGeometry args={[0.1, 20, 20]} />
      <meshStandardMaterial color="#d1fae5" emissive={C.emerald} emissiveIntensity={2.5} />
    </mesh>
  );
}

function Pipeline({ stateRef, onStageChange, reducedMotion }) {
  const group = useRef();
  const lastStage = useRef(-1);
  const { viewport } = useThree();
  const scale = Math.min(1.3, viewport.width / 9.6, viewport.height / 4.8);

  useFrame((state, dt) => {
    const s = stateRef.current;
    s.t = reducedMotion ? 7.5 : (s.t + Math.min(dt, 0.1)) % LOOP;
    const stage = stageAt(s.t);
    s.active = s.hover ?? stage;

    if (stage !== lastStage.current) {
      lastStage.current = stage;
      onStageChange?.(stage);
    }

    if (group.current && !reducedMotion) {
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.25) * 0.22;
    }
  });

  return (
    <group ref={group} scale={scale}>
      <group position={[0.05, 0, 0]}>
        <Line points={[[-2.98, 0.1, 0], [-2.47, 0.1, 0]]} color="#64748b" lineWidth={1} dashed dashSize={0.08} gapSize={0.07} />
        <Line points={[ROOT, SHIELD]} color="#64748b" lineWidth={1} dashed dashSize={0.08} gapSize={0.07} />
        <Line points={[SHIELD, NEW_BLOCK]} color="#64748b" lineWidth={1} dashed dashSize={0.08} gapSize={0.07} />
        <Device stateRef={stateRef} />
        <Prism stateRef={stateRef} />
        <Tree stateRef={stateRef} />
        <Commitment stateRef={stateRef} />
        <Verifier stateRef={stateRef} />
        <Chain stateRef={stateRef} />
        <ProofPulse stateRef={stateRef} />
      </group>
    </group>
  );
}

export default function ZkpScene({ hoverStage = null, onStageChange }) {
  const stateRef = useRef({ t: 0, active: 0, hover: null });
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    stateRef.current.hover = hoverStage;
  }, [hoverStage]);

  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0.6, 10], fov: 40 }} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[-4, 4, 6]} intensity={40} color="#a5b4fc" />
      <pointLight position={[5, -2, 5]} intensity={25} color="#6ee7b7" />
      {!reducedMotion && <Sparkles count={50} scale={[12, 6, 4]} size={1.6} speed={0.25} color="#a5b4fc" opacity={0.5} />}
      <Pipeline stateRef={stateRef} onStageChange={onStageChange} reducedMotion={reducedMotion} />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        rotateSpeed={0.5}
        minPolarAngle={Math.PI * 0.32}
        maxPolarAngle={Math.PI * 0.62}
        minAzimuthAngle={-0.75}
        maxAzimuthAngle={0.75}
      />
    </Canvas>
  );
}

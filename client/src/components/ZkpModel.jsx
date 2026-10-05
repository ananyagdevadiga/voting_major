import { Component, Suspense, lazy, useState } from "react";
import { ArrowRight, Blocks, Hash, KeyRound, Network } from "lucide-react";

// three.js is only downloaded when the home page shows the model.
const ZkpScene = lazy(() => import("./ZkpScene"));

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch {
    return false;
  }
}

class SceneBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const STATIC_STAGES = [
  { icon: KeyRound, label: "Device" },
  { icon: Hash, label: "Hash" },
  { icon: Network, label: "Merkle" },
  { icon: Blocks, label: "Chain" },
];

// Shown when WebGL is unavailable or the scene fails to load.
function StaticDiagram({ activeStage }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 px-6 sm:gap-4">
      {STATIC_STAGES.map((stage, i) => (
        <div key={stage.label} className="flex items-center gap-2 sm:gap-4">
          {i > 0 && <ArrowRight size={16} className="text-slate-600" aria-hidden="true" />}
          <div className="flex flex-col items-center gap-2">
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-colors ${
                activeStage === i
                  ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                  : "border-slate-700 bg-slate-800/60 text-slate-400"
              }`}
            >
              <stage.icon size={22} aria-hidden="true" />
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">{stage.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-400" />
    </div>
  );
}

export default function ZkpModel({ hoverStage, activeStage, onStageChange }) {
  const [webgl] = useState(hasWebGL);
  const fallback = <StaticDiagram activeStage={hoverStage ?? activeStage} />;

  if (!webgl) return fallback;

  return (
    <SceneBoundary fallback={fallback}>
      <Suspense fallback={<Loading />}>
        <ZkpScene hoverStage={hoverStage} onStageChange={onStageChange} />
      </Suspense>
    </SceneBoundary>
  );
}

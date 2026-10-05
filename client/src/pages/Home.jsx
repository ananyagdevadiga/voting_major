import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { fetchElection } from "../lib/api";
import Layout from "../components/Layout";
import ZkpModel from "../components/ZkpModel";
import { Notice, buttonClass } from "../components/ui";

// Primary action for each election phase (see contracts/Voting.sol).
const PHASE_ACTIONS = {
  registration: { label: "Register to vote", path: "/register" },
  registration_closed: { label: "Voting opens soon", path: null },
  voting: { label: "Cast your vote", path: "/verify-voter" },
  ended: { label: "View results", path: "/results" },
};

const PHASE_STATUS = {
  registration: "Registration open",
  registration_closed: "Registration closed",
  voting: "Voting open",
  ended: "Election ended",
};

// The contract's phases run one way, in this order.
const TIMELINE = [
  { phase: "registration", title: "Register" },
  { phase: "registration_closed", title: "Sealed" },
  { phase: "voting", title: "Voting" },
  { phase: "ended", title: "Results" },
];

// The four stages of the 3D model, in the same order as the scene's timeline.
const STEPS = [
  { title: "Credential", text: "Secret made on your device" },
  { title: "Commitment", text: "Only its hash is stored" },
  { title: "Merkle proof", text: "Prove you're on the roll" },
  { title: "On-chain", text: "Verified and counted" },
];

function Home() {
  const [election, setElection] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [hoverStage, setHoverStage] = useState(null);
  const [sceneStage, setSceneStage] = useState(0);

  useEffect(() => {
    fetchElection()
      .then((data) => {
        if (!PHASE_ACTIONS[data.phase]) {
          throw new Error(
            data.message ||
              "The voting server did not report an election phase. Is the backend up to date and the contract deployed?"
          );
        }
        setElection(data);
      })
      .catch((error) => setLoadError(error.message));
  }, []);

  const phase = election?.phase;
  const action = PHASE_ACTIONS[phase];
  const live = phase === "registration" || phase === "voting";
  const currentIndex = TIMELINE.findIndex((t) => t.phase === phase);
  const highlighted = hoverStage ?? sceneStage;

  return (
    <Layout fit>
      <div className="flex h-full min-h-0 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-12">
        <section className="shrink-0">
          {loadError ? (
            <>
              <h1 className="text-3xl font-semibold tracking-tight lg:text-5xl">SecureVote</h1>
              <Notice tone="error" title="The election could not be loaded" className="mt-6">
                {loadError}
              </Notice>
            </>
          ) : !election ? (
            <div className="space-y-4" aria-label="Loading election">
              <div className="h-7 w-40 animate-pulse rounded-full bg-slate-200" />
              <div className="h-12 w-4/5 animate-pulse rounded-xl bg-slate-200" />
              <div className="h-6 w-3/5 animate-pulse rounded-lg bg-slate-200" />
            </div>
          ) : (
            <>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600">
                <span className="relative flex h-2 w-2">
                  {live && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  )}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-slate-400"}`}
                  />
                </span>
                {PHASE_STATUS[phase]}
              </span>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl lg:mt-5 lg:text-5xl">
                {election.name}
              </h1>
              <p className="mt-2 text-lg font-medium text-slate-500 sm:text-xl lg:mt-3 lg:text-2xl">
                Vote privately. Prove it mathematically.
              </p>

              <div className="mt-5 flex gap-3 lg:mt-8">
                {action.path ? (
                  <Link to={action.path} className={`${buttonClass("primary")} flex-1 px-6 sm:flex-none`}>
                    {action.label}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                ) : (
                  <button type="button" disabled className={`${buttonClass("primary")} flex-1 px-6 sm:flex-none`}>
                    {action.label}
                  </button>
                )}
                {phase !== "ended" && (
                  <Link to="/results" className={`${buttonClass("secondary")} flex-1 px-6 sm:flex-none`}>
                    View results
                  </Link>
                )}
              </div>

              <ol className="mt-7 hidden items-center gap-2 text-xs sm:flex" aria-label="Election progress">
                {TIMELINE.map((item, i) => {
                  const done = i < currentIndex;
                  const current = i === currentIndex;
                  return (
                    <li key={item.phase} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
                      {i > 0 && <span className={`h-px w-6 ${done || current ? "bg-indigo-400" : "bg-slate-300"}`} />}
                      <span
                        className={`h-2 w-2 rounded-full ${
                          current ? "bg-indigo-600 ring-4 ring-indigo-100" : done ? "bg-indigo-400" : "bg-slate-300"
                        }`}
                      />
                      <span className={current ? "font-semibold text-slate-900" : "text-slate-500"}>{item.title}</span>
                    </li>
                  );
                })}
              </ol>
            </>
          )}

          <ol className="mt-8 hidden grid-cols-4 gap-2 lg:grid" aria-label="How a vote is proven">
            {STEPS.map((step, i) => {
              const active = highlighted === i;
              return (
                <li key={step.title}>
                  <button
                    type="button"
                    onMouseEnter={() => setHoverStage(i)}
                    onMouseLeave={() => setHoverStage(null)}
                    onFocus={() => setHoverStage(i)}
                    onBlur={() => setHoverStage(null)}
                    className={`h-full w-full rounded-xl border p-3 text-left transition-colors ${
                      active ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                        active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="mt-2 block text-sm font-medium text-slate-900">{step.title}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-500">{step.text}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl bg-linear-to-br from-slate-950 via-slate-900 to-indigo-950 shadow-xl shadow-indigo-950/10 lg:h-full lg:max-h-120">
          <ZkpModel hoverStage={hoverStage} activeStage={sceneStage} onStageChange={setSceneStage} />
          <p className="pointer-events-none absolute left-5 top-4 text-xs font-medium text-slate-400">
            How your vote is proven
          </p>
          <p className="pointer-events-none absolute bottom-4 right-5 hidden text-xs text-slate-500 sm:block">
            Drag to rotate
          </p>
        </div>
      </div>
    </Layout>
  );
}

export default Home;

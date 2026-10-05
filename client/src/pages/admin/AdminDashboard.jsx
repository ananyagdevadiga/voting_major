import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { closeRegistration, endElection, fetchOverview, fetchVoters, openVoting } from "../../lib/adminApi";
import { Button, Card, Notice, ResultsList, Spinner } from "../../components/ui";
import ConfirmDialog from "../../components/ConfirmDialog";
import VotersCard from "./VotersCard";
import { plural } from "./format";

// The contract's phases run one way, in this order (contracts/Voting.sol).
const TIMELINE = [
  { phase: "registration", title: "Registration" },
  { phase: "registration_closed", title: "Registry sealed" },
  { phase: "voting", title: "Voting" },
  { phase: "ended", title: "Ended" },
];

// The one step the administrator can take next in each phase.
const NEXT_STEP = {
  registration: {
    title: "Registration is open",
    label: "Close registration",
    run: closeRegistration,
    command: "npm run election:close-registration",
    confirmTitle: "Close registration?",
    confirm: ["Registration stops and the voter registry is published. This can't be undone."],
    done: (r) => `Registration closed. ${r.registry.registered} of ${r.registry.eligible} voters registered.`,
  },
  registration_closed: {
    title: "Registry published for review",
    label: "Open voting",
    run: openVoting,
    command: "npm run election:open",
    confirmTitle: "Open voting?",
    confirm: ["The registry is locked on-chain and voting starts. This can't be undone."],
    done: (r) => `Voting is open for ${r.registered} registered voters.`,
  },
  voting: {
    title: "Voting is open",
    label: "End election",
    run: endElection,
    command: "npm run election:end",
    confirmTitle: "End the election?",
    confirm: ["Voting stops and the results become final. This can't be undone."],
    done: (r) => `The election has ended with ${plural(r.results.total, "vote")}.`,
  },
  ended: { title: "Election ended" },
};

const shorten = (value) => (value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value);

function AdminDashboard({ onSessionExpired }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { tone, text }

  const load = useCallback(async () => {
    try {
      const [overview, { voters }] = await Promise.all([fetchOverview(), fetchVoters()]);
      setData({ overview, voters });
      setLoadError("");
    } catch (err) {
      if (err.code === "ADMIN_AUTH_REQUIRED") onSessionExpired();
      else setLoadError(err.message);
    }
  }, [onSessionExpired]);

  // Registrations and votes arrive all the time, so the dashboard refreshes itself.
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  if (!data) {
    return loadError ? (
      <Notice tone="error" title="The dashboard could not be loaded" className="mx-auto max-w-xl">
        {loadError}
      </Notice>
    ) : (
      <Spinner label="Loading the election…" />
    );
  }

  const { overview, voters } = data;
  const { phase, roll, registry, results, phaseControls } = overview;
  const step = NEXT_STEP[phase];
  const currentIndex = TIMELINE.findIndex((t) => t.phase === phase);

  async function runNextStep() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await step.run();
      setMessage({ tone: "success", text: step.done(result) });
    } catch (err) {
      if (err.code === "ADMIN_AUTH_REQUIRED") return onSessionExpired();
      // ROLL_CHANGED: the new registry was published; it needs a second look.
      setMessage({ tone: err.code === "ROLL_CHANGED" ? "warning" : "error", text: err.message });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">
            Election #{overview.election.electionId} ·{" "}
            <span className="font-mono" title={overview.election.contractAddress}>
              {shorten(overview.election.contractAddress)}
            </span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{overview.election.name}</h1>
        </div>
        <Button variant="secondary" onClick={load}>
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" aria-label="Election progress">
        {TIMELINE.map((item, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <li key={item.phase} className="flex items-center gap-3" aria-current={current ? "step" : undefined}>
              {i > 0 && <span className={`h-px w-8 ${done || current ? "bg-indigo-400" : "bg-slate-300"}`} />}
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  current ? "bg-indigo-600 ring-4 ring-indigo-100" : done ? "bg-indigo-400" : "bg-slate-300"
                }`}
              />
              <span className={current ? "font-semibold text-slate-900" : "text-slate-500"}>{item.title}</span>
            </li>
          );
        })}
      </ol>

      {loadError && <Notice tone="warning" title="Showing the last loaded data">{loadError}</Notice>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="text-sm font-medium text-indigo-600">{step.label ? "Next step" : "Status"}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{step.title}</h2>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Registered voters</dt>
              <dd className="font-medium tabular-nums">
                {roll.registered} of {roll.eligible}
              </dd>
            </div>
            {(phase === "voting" || phase === "ended") && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Votes cast</dt>
                <dd className="font-medium tabular-nums">{results.total}</dd>
              </div>
            )}
            {registry && (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Voters in the registry</dt>
                  <dd className="font-medium tabular-nums">{registry.voterCount}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Registry root</dt>
                  <dd className="font-mono text-slate-700" title={registry.root}>
                    {shorten(registry.root)}
                  </dd>
                </div>
                <a
                  href="/voterProofData.json"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-indigo-600 hover:text-indigo-500"
                >
                  View the published registry
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              </>
            )}
          </dl>

          {message && (
            <Notice tone={message.tone} className="mt-5">
              {message.text}
            </Notice>
          )}

          {step.label && !phaseControls.available && (
            <Notice tone="warning" title="Phase changes are off" className="mt-5">
              {phaseControls.reason}. Use the terminal instead: <code className="font-mono">{step.command}</code>
            </Notice>
          )}

          {step.label ? (
            <Button
              className="mt-6"
              block
              onClick={() => setConfirming(true)}
              disabled={!phaseControls.available || busy}
            >
              {step.label}
            </Button>
          ) : (
            <p className="mt-6 text-sm text-slate-500">The results are final.</p>
          )}
        </Card>

        <Card>
          <h2 className="text-xl font-semibold tracking-tight">Results</h2>
          <p className="mt-1 mb-6 text-sm text-slate-500">Live tally from the smart contract.</p>
          <ResultsList candidates={results.candidates} total={results.total} />
        </Card>
      </div>

      {/* Remounted per phase so notices from an earlier phase do not linger. */}
      <VotersCard
        key={phase}
        phase={phase}
        voters={voters}
        capacity={overview.election.capacity}
        onChanged={load}
        onSessionExpired={onSessionExpired}
      />

      {step.label && (
        <ConfirmDialog
          open={confirming}
          title={step.confirmTitle}
          confirmLabel={step.label}
          busy={busy}
          onConfirm={runNextStep}
          onCancel={() => setConfirming(false)}
        >
          {step.confirm.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </ConfirmDialog>
      )}
    </div>
  );
}

export default AdminDashboard;

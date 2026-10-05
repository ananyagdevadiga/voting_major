import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CircleOff } from "lucide-react";
import { fetchElection } from "../../lib/api";
import { useVoterSession } from "../../context/VoterSession";
import Layout from "../../components/Layout";
import { Button, Card, CardHeader, Notice, Spinner, StatusCard, StepProgress } from "../../components/ui";

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export default function Vote() {
  const navigate = useNavigate();
  const { session } = useVoterSession();

  const [election, setElection] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [selectedVote, setSelectedVote] = useState(null);

  useEffect(() => {
    fetchElection()
      .then(setElection)
      .catch((error) => setLoadError(error.message));
  }, []);

  if (!session) {
    return <Navigate to="/verify-voter" replace />;
  }

  const selected = election?.candidates.find((c) => c.id === selectedVote);

  const handleVoteSubmit = (event) => {
    event.preventDefault();
    if (!selected) return;

    navigate("/processing", {
      state: {
        candidate: selected,
        election: {
          electionId: election.electionId,
          candidateCount: election.candidateCount,
          merkleRoot: election.merkleRoot,
        },
      },
    });
  };

  if (loadError) {
    return (
      <Layout>
        <StatusCard tone="error" icon={CircleOff} title="Election unavailable">
          <p>{loadError}</p>
        </StatusCard>
      </Layout>
    );
  }

  if (!election) {
    return (
      <Layout>
        <Spinner label="Loading ballot…" />
      </Layout>
    );
  }

  return (
    <Layout>
      <StepProgress step={2} total={3} label="Choose" />

      <Card>
        <CardHeader title="Choose a candidate" subtitle={election.name} />

        {!election.votingOpen && (
          <Notice tone="warning" className="mb-6">
            Voting is currently closed. You can view the ballot, but can't submit a vote.
          </Notice>
        )}

        <form onSubmit={handleVoteSubmit}>
          <fieldset disabled={!election.votingOpen} className="space-y-3">
            <legend className="sr-only">Candidates</legend>
            {election.candidates.map((candidate) => {
              const checked = selectedVote === candidate.id;

              return (
                <label
                  key={candidate.id}
                  className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition has-disabled:cursor-not-allowed has-disabled:opacity-60 has-focus-visible:ring-2 has-focus-visible:ring-indigo-500 ${
                    checked
                      ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="candidate"
                    value={candidate.id}
                    checked={checked}
                    onChange={() => setSelectedVote(candidate.id)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      checked ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                    aria-hidden="true"
                  >
                    {initials(candidate.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-900">{candidate.name}</span>
                    {candidate.party && <span className="block text-sm text-slate-500">{candidate.party}</span>}
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      checked ? "border-indigo-600" : "border-slate-300"
                    }`}
                    aria-hidden="true"
                  >
                    {checked && <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />}
                  </span>
                </label>
              );
            })}
          </fieldset>

          <Button type="submit" block className="mt-6" disabled={!election.votingOpen || !selected}>
            {selected ? `Vote for ${selected.name}` : "Select a candidate"}
          </Button>
          <p className="mt-3 text-center text-xs text-slate-500">Votes are final and can't be changed after submitting.</p>
        </form>
      </Card>
    </Layout>
  );
}

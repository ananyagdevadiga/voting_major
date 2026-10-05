import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, LoaderCircle } from "lucide-react";
import { groth16 } from "snarkjs";
import { submitVote } from "../../lib/api";
import {
  VOTE_WASM_URL,
  VOTE_ZKEY_URL,
  computeNullifier,
  loadVoterProofData,
  secretToBigInt,
} from "../../lib/zk";
import { useVoterSession } from "../../context/VoterSession";
import Layout from "../../components/Layout";
import { Card, CardHeader, StepProgress } from "../../components/ui";

const steps = [
  "Preparing ballot",
  "Loading voter registry",
  "Generating zero-knowledge proof",
  "Sending proof",
  "Verifying on-chain",
];

function Processing() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, clearSession } = useVoterSession();

  const candidate = location.state?.candidate;
  const election = location.state?.election;

  const [currentStep, setCurrentStep] = useState(0);

  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;

    hasProcessed.current = true;

    if (!candidate || !election || !session) {
      navigate("/verify-voter", { replace: true });
      return;
    }

    const processVote = async () => {
      try {
        setCurrentStep(0);

        if (String(session.electionId) !== String(election.electionId)) {
          throw new Error("Your credential is for a different election.");
        }

        // --------------------------------------------------
        // Load voter Merkle path
        // --------------------------------------------------

        setCurrentStep(1);

        const voterData = await loadVoterProofData();

        const voter = voterData.voters.find(
          (v) => v.commitment === session.commitment
        );

        if (!voter) {
          throw new Error("Voter proof information not found");
        }

        if (voterData.root !== election.merkleRoot) {
          throw new Error(
            "The voter registry is out of date with the blockchain. Please contact the election administrator."
          );
        }

        // --------------------------------------------------
        // Generate ZKP (secret stays in the browser)
        // --------------------------------------------------

        setCurrentStep(2);

        const input = {
          root: voterData.root,
          nullifierHash: computeNullifier(
            session.secret,
            election.electionId
          ),
          electionId: String(election.electionId),
          candidateCount: String(election.candidateCount),
          vote: String(candidate.id),
          secret: secretToBigInt(session.secret).toString(),
          pathElements: voter.pathElements,
          pathIndices: voter.pathIndices,
        };

        const { proof, publicSignals } = await groth16.fullProve(
          input,
          VOTE_WASM_URL,
          VOTE_ZKEY_URL
        );

        // --------------------------------------------------
        // Send proof to backend (it relays it to the contract)
        // --------------------------------------------------

        setCurrentStep(3);

        const data = await submitVote(proof, publicSignals);

        setCurrentStep(4);

        if (data.success) {
          clearSession();
          navigate("/success", {
            replace: true,
            state: {
              candidate,
              results: data.results,
              transactionHash: data.transactionHash,
              blockNumber: data.blockNumber,
            },
          });
          return;
        }

        if (data.code === "DUPLICATE_VOTE") {
          clearSession();
          navigate("/duplicate-vote", {
            replace: true,
            state: { candidate },
          });
          return;
        }

        navigate("/error", {
          replace: true,
          state: {
            candidate,
            message: data.message || "Vote verification failed.",
          },
        });
      } catch (error) {
        console.error("Vote processing error:", error.message);

        navigate("/error", {
          replace: true,
          state: {
            candidate,
            message:
              error.message ||
              "Something went wrong while processing the vote",
          },
        });
      }
    };

    processVote();
  }, [candidate, election, session, clearSession, navigate]);

  return (
    <Layout>
      <StepProgress step={3} total={3} label="Submit" />

      <Card>
        <CardHeader title="Submitting your vote" subtitle="Your proof is being created in this browser." />

        <ol className="space-y-1" aria-live="polite">
          {steps.map((step, index) => {
            const done = index < currentStep;
            const active = index === currentStep;

            return (
              <li
                key={step}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${active ? "bg-indigo-50/70" : ""}`}
                aria-current={active ? "step" : undefined}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                  {done ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  ) : active ? (
                    <LoaderCircle size={18} className="animate-spin text-indigo-600" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  )}
                </span>
                <span className={done ? "text-slate-700" : active ? "font-medium text-indigo-900" : "text-slate-400"}>
                  {step}
                </span>
                {done && <span className="sr-only">(complete)</span>}
              </li>
            );
          })}
        </ol>

        <p className="mt-6 text-center text-xs text-slate-500">Keep this page open.</p>
      </Card>
    </Layout>
  );
}

export default Processing;

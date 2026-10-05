import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, FileCheck2, Upload } from "lucide-react";
import { computeCommitment, loadVoterProofData } from "../../lib/zk";
import { useVoterSession } from "../../context/VoterSession";
import Layout from "../../components/Layout";
import { Button, Card, CardHeader, Field, StepProgress, inputClass } from "../../components/ui";

function VerifyVoter() {
  const navigate = useNavigate();
  const { setSession } = useVoterSession();

  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const fail = (message) =>
    navigate("/invalid-credentials", { state: { message } });

  // Reads the credential file saved at registration (it never leaves the browser).
  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      if (typeof data.credential !== "string") throw new Error();
      setSecret(data.credential);
      setFileName(file.name);
      setError("");
    } catch {
      setFileName("");
      setError("That file is not a SecureVote credential file.");
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();

    if (!secret.trim()) {
      setError("Enter your voting credential, or load your credential file.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const voterData = await loadVoterProofData();

      // The credential is checked locally: its commitment must be a leaf of
      // the published registry. Nothing is sent to the server.
      const commitment = computeCommitment(secret.trim());
      const voter = voterData.voters.find((v) => v.commitment === commitment);

      if (!voter) {
        fail("This credential isn't in the voter registry.");
        return;
      }

      setSession({
        secret: secret.trim(),
        commitment,
        electionId: String(voterData.electionId),
      });

      navigate("/vote");
    } catch (error) {
      console.error("Voter verification error:", error.message);
      fail(error.message || "Unable to verify voter.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <StepProgress step={1} total={3} label="Verify" />

      <Card>
        <CardHeader title="Enter your credential" subtitle="Paste the credential you saved, or upload the file." />

        <form onSubmit={handleVerify} className="space-y-5" noValidate>
          <Field id="credential" label="Voting credential" error={error}>
            <div className="relative">
              <input
                id="credential"
                type={visible ? "text" : "password"}
                autoComplete="off"
                spellCheck="false"
                autoFocus
                value={secret}
                onChange={(e) => {
                  setSecret(e.target.value);
                  setFileName("");
                }}
                className={`${inputClass} pr-11 font-mono text-sm ${error ? "border-rose-400" : ""}`}
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:text-slate-700"
                aria-label={visible ? "Hide credential" : "Show credential"}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>

          <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            or
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-600 transition-colors hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-700 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-500">
            {fileName ? (
              <>
                <FileCheck2 size={16} className="text-emerald-600" aria-hidden="true" />
                <span className="truncate">{fileName}</span>
              </>
            ) : (
              <>
                <Upload size={16} aria-hidden="true" />
                Upload credential file
              </>
            )}
            <input type="file" accept="application/json,.json" className="sr-only" onChange={handleFile} />
          </label>

          <Button type="submit" block busy={loading} disabled={loading} className="mt-7!">
            {loading ? "Checking registry…" : "Continue"}
          </Button>
        </form>
      </Card>
    </Layout>
  );
}

export default VerifyVoter;

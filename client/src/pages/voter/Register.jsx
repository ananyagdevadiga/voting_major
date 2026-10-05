import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarX2, Check, CheckCircle2, Copy, Download, EyeOff, KeyRound, MonitorSmartphone } from "lucide-react";
import {
  fetchElection,
  requestRegistrationCode,
  verifyRegistrationCode,
  commitRegistration,
} from "../../lib/api";
import { computeCommitment, generateSecret } from "../../lib/zk";
import Layout from "../../components/Layout";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Notice,
  Spinner,
  StatusCard,
  StepProgress,
  buttonClass,
  inputClass,
} from "../../components/ui";

function downloadCredential(voterId, electionId, secret) {
  const file = new Blob(
    [JSON.stringify({ voterId, electionId, credential: secret, createdAt: new Date().toISOString() }, null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `securevote-credential-${voterId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

const STEPS = {
  id: { step: 1, label: "Voter ID" },
  code: { step: 2, label: "Email verification" },
  save: { step: 3, label: "Save credential" },
};

// Shown as small tiles under the credential instead of sentences.
const CREDENTIAL_FACTS = [
  { icon: MonitorSmartphone, label: "Only on this device" },
  { icon: KeyRound, label: "Can't be recovered" },
  { icon: EyeOff, label: "Never share it" },
];

/*
 * Registration: prove control of the email on the roll with a one-time code,
 * then create the voting credential HERE, in the browser. Only its commitment
 * Poseidon(secret) is sent to the server.
 */
function Register() {
  const [election, setElection] = useState(null);
  const [step, setStep] = useState("loading"); // loading | closed | id | code | save | done
  const [voterId, setVoterId] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [secret, setSecret] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { type: "error" | "info", text }
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchElection()
      .then((data) => {
        setElection(data);
        setStep(data.phase === "registration" ? "id" : "closed");
      })
      .catch((error) => {
        setMessage({ type: "error", text: error.message });
        setStep("closed");
      });
  }, []);

  const confirmed = useMemo(
    () => secret !== "" && confirmation.trim() === secret,
    [secret, confirmation]
  );

  async function run(action) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  const handleRequestCode = () =>
    run(async () => {
      if (!voterId.trim()) throw new Error("Enter your voter ID");
      const data = await requestRegistrationCode(voterId.trim());
      if (!data.success) throw new Error(data.message);
      setStep("code");
    });

  const handleVerifyCode = () =>
    run(async () => {
      const data = await verifyRegistrationCode(voterId.trim(), code.trim());
      if (!data.success) {
        if (data.code === "TOO_MANY_ATTEMPTS") {
          setCode("");
          setStep("id");
        }
        throw new Error(data.message);
      }
      setToken(data.token);
      setVoterId(data.voterId);
      setAlreadyRegistered(data.alreadyRegistered);
      setSecret(generateSecret());
      setStep("save");
    });

  const handleRegister = () =>
    run(async () => {
      const data = await commitRegistration(token, computeCommitment(secret));
      if (!data.success) {
        if (data.code === "DUPLICATE_COMMITMENT") {
          setSecret(generateSecret());
          setConfirmation("");
        }
        if (data.code === "INVALID_TOKEN") {
          setStep("id");
        }
        throw new Error(data.message);
      }
      setMessage({ type: "info", text: data.message });
      setStep("done");
    });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ type: "error", text: "Copying failed. Select the credential and copy it manually." });
    }
  };

  // Enter submits each step, same as clicking its button.
  const onSubmit = (handler) => (event) => {
    event.preventDefault();
    if (!busy) handler();
  };

  const notice = message && (
    <Notice tone={message.type === "error" ? "error" : "info"} className="mb-6">
      {message.text}
    </Notice>
  );

  if (step === "loading") {
    return (
      <Layout>
        <Spinner label="Checking registration status…" />
      </Layout>
    );
  }

  if (step === "closed") {
    return (
      <Layout>
        {notice}
        <StatusCard
          tone="warning"
          icon={CalendarX2}
          title="Registration is not open"
          actions={<Link to="/" className={buttonClass("secondary", true)}>Back to home</Link>}
        >
          <p>{election ? "Registration has closed for this election." : "Couldn't reach the voting server."}</p>
        </StatusCard>
      </Layout>
    );
  }

  if (step === "done") {
    return (
      <Layout>
        <StatusCard
          tone="success"
          icon={CheckCircle2}
          title="You're registered"
          actions={<Link to="/" className={buttonClass("primary", true)}>Back to home</Link>}
        >
          <p>
            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-medium text-slate-700">
              {voterId}
            </span>
          </p>
          <p>Keep your credential safe. You'll need it to vote.</p>
        </StatusCard>
      </Layout>
    );
  }

  return (
    <Layout>
      <StepProgress step={STEPS[step].step} total={3} label={STEPS[step].label} />

      <Card>
        {step === "id" && (
          <>
            <CardHeader title="Register to vote" subtitle="We'll email you a one-time code." />
            {notice}
            <form onSubmit={onSubmit(handleRequestCode)} className="space-y-6">
              <Field id="voter-id" label="Voter ID">
                <input
                  id="voter-id"
                  className={`${inputClass} font-mono`}
                  autoComplete="off"
                  spellCheck="false"
                  placeholder="VOTER-0001"
                  autoFocus
                  value={voterId}
                  onChange={(e) => setVoterId(e.target.value)}
                />
              </Field>
              <Button type="submit" block busy={busy} disabled={busy}>
                {busy ? "Sending code…" : "Send code"}
              </Button>
            </form>
          </>
        )}

        {step === "code" && (
          <>
            <CardHeader
              title="Check your email"
              subtitle={
                <>
                  Enter the 6-digit code emailed for <span className="font-mono text-slate-700">{voterId.trim()}</span>.
                </>
              }
            />
            {notice}
            <form onSubmit={onSubmit(handleVerifyCode)} className="space-y-6">
              <Field id="otp" label="Verification code">
                <input
                  id="otp"
                  className={`${inputClass} h-14 text-center font-mono text-2xl tracking-[0.5em]`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  placeholder="······"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
              <div className="space-y-2">
                <Button type="submit" block busy={busy} disabled={busy || code.length !== 6}>
                  {busy ? "Checking…" : "Verify code"}
                </Button>
                <Button variant="ghost" block onClick={() => setStep("id")}>
                  Use a different voter ID
                </Button>
              </div>
            </form>
          </>
        )}

        {step === "save" && (
          <>
            <CardHeader title="Save your credential" subtitle="You'll need it to vote." />
            {notice}

            {alreadyRegistered && (
              <Notice tone="warning" className="mb-6">
                This replaces {voterId}'s existing credential.
              </Notice>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="select-all break-all text-center font-mono text-[0.95rem] leading-relaxed text-slate-800">
                {secret}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => downloadCredential(voterId, election.electionId, secret)}>
                <Download size={16} aria-hidden="true" /> Download
              </Button>
              <Button variant="secondary" onClick={handleCopy}>
                {copied ? <Check size={16} className="text-emerald-600" aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <ul className="mt-5 grid grid-cols-3 gap-2">
              {CREDENTIAL_FACTS.map((fact) => {
                const Icon = fact.icon;
                return (
                  <li
                    key={fact.label}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 px-2 py-3 text-center text-xs font-medium text-slate-600"
                  >
                    <Icon size={16} className="text-indigo-500" aria-hidden="true" />
                    {fact.label}
                  </li>
                );
              })}
            </ul>

            <form onSubmit={onSubmit(handleRegister)} className="mt-6 space-y-6 border-t border-slate-100 pt-6">
              <Field id="confirm-credential" label="Confirm your credential" hint="Paste it back to confirm.">
                <div className="relative">
                  <input
                    id="confirm-credential"
                    className={`${inputClass} pr-10 font-mono text-sm ${confirmed ? "border-emerald-500!" : ""}`}
                    autoComplete="off"
                    spellCheck="false"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                  {confirmed && (
                    <CheckCircle2
                      size={18}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500"
                      aria-label="Credential matches"
                    />
                  )}
                </div>
              </Field>
              <Button type="submit" block busy={busy} disabled={busy || !confirmed}>
                {busy ? "Registering…" : "Complete registration"}
              </Button>
            </form>
          </>
        )}
      </Card>
    </Layout>
  );
}

export default Register;

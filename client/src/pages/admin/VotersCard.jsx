import { useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { addVoters, resetVoter } from "../../lib/adminApi";
import { Button, Card, Field, Notice, inputClass } from "../../components/ui";
import ConfirmDialog from "../../components/ConfirmDialog";

// Emails may be pasted one per line, or separated by commas, semicolons or spaces.
const parseEmails = (text) => text.split(/[\s,;]+/).filter(Boolean);

function VotersCard({ phase, voters, capacity, onChanged, onSessionExpired }) {
  const [adding, setAdding] = useState(false);
  const [emailText, setEmailText] = useState("");
  const [query, setQuery] = useState("");
  const [resetting, setResetting] = useState(null); // voter being confirmed
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { tone, text }

  const canAdd = phase === "registration";
  const canReset = phase === "registration" || phase === "registration_closed";
  const registered = voters.filter((v) => v.registered).length;
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? voters.filter((v) => v.voterId.toLowerCase().includes(needle) || v.email.includes(needle))
    : voters;

  async function run(action, onDone) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      onDone(result);
      onChanged();
    } catch (err) {
      if (err.code === "ADMIN_AUTH_REQUIRED") return onSessionExpired();
      setMessage({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  function submitEmails(event) {
    event.preventDefault();
    run(
      () => addVoters(parseEmails(emailText)),
      ({ added }) => {
        setEmailText("");
        setAdding(false);
        setMessage({
          tone: "success",
          text: `Added ${added.map((v) => v.voterId).join(", ")}. Share each voter ID with its voter.`,
        });
      }
    );
  }

  function confirmReset() {
    const { voterId } = resetting;
    run(
      () => resetVoter(voterId),
      () => {
        setResetting(null);
        setMessage({
          tone: "success",
          text:
            phase === "registration"
              ? `${voterId} was reset and can register again.`
              : `${voterId} was reset. The registry is republished when voting opens.`,
        });
      }
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Electoral roll</h2>
          <p className="mt-1 text-sm text-slate-500">
            {registered} of {voters.length} registered · capacity {capacity.toLocaleString()}
          </p>
        </div>
        {canAdd && !adding && (
          <Button onClick={() => setAdding(true)}>
            <UserPlus size={16} aria-hidden="true" />
            Add voters
          </Button>
        )}
      </div>

      {adding && (
        <form onSubmit={submitEmails} className="mt-6 space-y-4 rounded-xl bg-slate-50 p-4 sm:p-5">
          <Field
            id="add-emails"
            label="Email addresses"
            hint="One per line, or separated by commas."
          >
            <textarea
              id="add-emails"
              rows={4}
              autoFocus
              value={emailText}
              onChange={(event) => setEmailText(event.target.value)}
              placeholder={"alice@example.com\nbob@example.com"}
              className={`${inputClass} h-auto py-2.5 font-mono text-sm`}
            />
          </Field>
          <div className="flex gap-3">
            <Button type="submit" busy={busy} disabled={busy || parseEmails(emailText).length === 0}>
              Add {parseEmails(emailText).length || ""} to the roll
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {message && (
        <Notice tone={message.tone} className="mt-6">
          {message.text}
        </Notice>
      )}

      {voters.length > 0 && (
        <div className="relative mt-6">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search voters"
            placeholder="Search by voter ID or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={`${inputClass} pl-10`}
          />
        </div>
      )}

      {voters.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No voters on the roll yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-136 text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th scope="col" className="py-3 pr-4 font-medium">Voter ID</th>
                <th scope="col" className="py-3 pr-4 font-medium">Email</th>
                <th scope="col" className="py-3 pr-4 font-medium">Status</th>
                <th scope="col" className="py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((voter) => (
                <tr key={voter.voterId}>
                  <td className="py-3 pr-4 font-mono text-slate-800">{voter.voterId}</td>
                  <td className="py-3 pr-4 text-slate-700">{voter.email}</td>
                  <td className="py-3 pr-4">
                    {voter.registered ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Registered {new Date(voter.registeredAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Not registered
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {voter.registered && canReset && (
                      <button
                        type="button"
                        onClick={() => setResetting(voter)}
                        className="-my-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      >
                        Reset
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No voters match "{query}".</p>}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(resetting)}
        title={`Reset ${resetting?.voterId}?`}
        confirmLabel="Reset registration"
        busy={busy}
        onConfirm={confirmReset}
        onCancel={() => setResetting(null)}
      >
        <p>Their current credential will stop working.</p>
        {phase === "registration" ? (
          <p>They can register again.</p>
        ) : (
          <p className="font-medium text-amber-700">Registration is closed, so they won't be able to vote.</p>
        )}
      </ConfirmDialog>
    </Card>
  );
}

export default VotersCard;

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { fetchActivity } from "../../lib/adminApi";
import { Button, Card, Notice, Spinner } from "../../components/ui";
import { plural } from "./format";

const MAX_ENTRIES = 500; // the most the server returns at once

// What each logged admin action reads as.
const EVENTS = {
  login: () => "Signed in",
  login_failed: () => "Failed sign-in attempt",
  voters_added: (e) => `Added ${plural(e.voterIds.length, "voter")} (${e.voterIds.join(", ")})`,
  voter_reset: (e) => `Reset the registration of ${e.voterId}`,
  registration_closed: (e) => `Closed registration: ${e.registered} of ${e.eligible} voters registered`,
  voting_opened: (e) => `Opened voting for ${plural(e.registered, "voter")}`,
  voting_ended: (e) => `Ended the election with ${plural(e.total, "vote")}`,
};

const describe = (entry) => (EVENTS[entry.action] ? EVENTS[entry.action](entry) : entry.action);

// Seconds included: several attempts can land in the same minute.
const formatTime = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });

// Express reports local requests as ::1 or ::ffff:127.0.0.1.
function formatIp(ip = "") {
  const address = ip.replace(/^::ffff:/, "");
  return address === "::1" || address === "127.0.0.1" ? "localhost" : address || "—";
}

/*
 * /admin/logs — every action taken in the admin portal, newest first, read
 * from the server's append-only log (data/admin-log.jsonl).
 */
function AdminLogs({ onSessionExpired }) {
  const [log, setLog] = useState(null); // { activity, total }
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      fetchActivity(MAX_ENTRIES)
        .then((data) => {
          setLog(data);
          setError("");
        })
        .catch((err) => {
          if (err.code === "ADMIN_AUTH_REQUIRED") onSessionExpired();
          else setError(err.message);
        }),
    [onSessionExpired]
  );

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const shown = log?.activity.length ?? 0;
  // `total` is missing when the backend predates the full log; show what came back.
  const total = log?.total ?? shown;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
          <p className="mt-1 text-sm text-slate-500">Every action taken in the admin portal, newest first.</p>
        </div>
        <Button variant="secondary" onClick={load}>
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {error && (
        <Notice tone={log ? "warning" : "error"} title={log ? "Showing the last loaded log" : "The log could not be loaded"}>
          {error}
        </Notice>
      )}

      {log ? (
        <Card>
          <p className="text-sm text-slate-500">
            {total > shown
              ? `Showing the latest ${shown} of ${total} entries.`
              : plural(total, "entry", "entries")}
          </p>

          {shown === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No admin actions yet.</p>
          ) : (
            // Below sm, time and IP move onto a second line under each event.
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th scope="col" className="hidden py-3 pr-4 font-medium sm:table-cell">Time</th>
                    <th scope="col" className="py-3 pr-4 font-medium">Event</th>
                    <th scope="col" className="hidden py-3 font-medium sm:table-cell">IP address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {log.activity.map((entry, i) => {
                    const failed = entry.action === "login_failed";
                    return (
                      <tr key={`${entry.at}-${entry.action}-${i}`}>
                        <td className="hidden whitespace-nowrap py-3 pr-4 tabular-nums text-slate-500 sm:table-cell">
                          {formatTime(entry.at)}
                        </td>
                        <td className={`py-3 pr-4 ${failed ? "font-medium text-amber-700" : "text-slate-800"}`}>
                          <span className="inline-flex items-center gap-1.5">
                            {failed && <AlertTriangle size={14} aria-hidden="true" />}
                            {describe(entry)}
                          </span>
                          <span className="mt-0.5 block text-xs font-normal tabular-nums text-slate-500 sm:hidden">
                            {formatTime(entry.at)} · {formatIp(entry.ip)}
                          </span>
                        </td>
                        <td className="hidden whitespace-nowrap py-3 font-mono text-xs text-slate-500 sm:table-cell">
                          {formatIp(entry.ip)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        !error && <Spinner label="Loading the activity log…" />
      )}
    </div>
  );
}

export default AdminLogs;

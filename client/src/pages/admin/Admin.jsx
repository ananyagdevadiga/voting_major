import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, ScrollText, ShieldCheck, Vote } from "lucide-react";
import { adminLogout, getAdminSession } from "../../lib/adminApi";
import { Card, Notice, Spinner } from "../../components/ui";
import AdminLogin from "./AdminLogin";
import AdminDashboard from "./AdminDashboard";
import AdminLogs from "./AdminLogs";

// Header items; below the sm breakpoint only their icons show.
const navItemClass = (active) =>
  `inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
    active ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

/*
 * The election administrator's portal: /admin (dashboard) and /admin/logs
 * (activity log). Shows the sign-in form until the backend confirms a
 * session. A session that expires mid-use (or a backend restart) brings the
 * sign-in form back.
 */
function Admin() {
  const navigate = useNavigate();
  // loading | disabled | signed-out | signed-in | error
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const checkSession = useCallback(() => {
    getAdminSession()
      .then((session) => {
        if (!session.enabled) setStatus("disabled");
        else setStatus(session.authenticated ? "signed-in" : "signed-out");
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
      });
  }, []);

  useEffect(checkSession, [checkSession]);

  const sessionExpired = useCallback(() => setStatus("signed-out"), []);

  async function signOut() {
    await adminLogout().catch(() => {});
    setStatus("signed-out");
    navigate("/admin");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5 rounded-lg">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Vote size={18} aria-hidden="true" />
            </span>
            <span className="font-semibold tracking-tight">SecureVote</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Admin</span>
          </Link>
          {status === "signed-in" && (
            <nav aria-label="Admin" className="flex items-center gap-1">
              <NavLink to="/admin" end className={({ isActive }) => navItemClass(isActive)}>
                <LayoutDashboard size={16} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Dashboard</span>
              </NavLink>
              <NavLink to="/admin/logs" className={({ isActive }) => navItemClass(isActive)}>
                <ScrollText size={16} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Logs</span>
              </NavLink>
              <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
              <button type="button" onClick={signOut} className={navItemClass(false)}>
                <LogOut size={16} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Sign out</span>
              </button>
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:py-10">
        {status === "loading" && <Spinner label="Checking your session…" />}

        {status === "error" && (
          <div className="mx-auto max-w-120">
            <Notice tone="error" title="The admin portal is unavailable">
              {error}
            </Notice>
          </div>
        )}

        {status === "disabled" && (
          <Card className="mx-auto max-w-120">
            <ShieldCheck size={24} className="text-indigo-600" aria-hidden="true" />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Admin portal not set up</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Set an administrator password on the server, then restart the backend:
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 font-mono text-sm text-slate-100">
              cd backend{"\n"}npm run admin:set-password
            </pre>
          </Card>
        )}

        {status === "signed-out" && <AdminLogin onSignedIn={() => setStatus("signed-in")} />}

        {status === "signed-in" && (
          <Routes>
            <Route index element={<AdminDashboard onSessionExpired={sessionExpired} />} />
            <Route path="logs" element={<AdminLogs onSessionExpired={sessionExpired} />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default Admin;

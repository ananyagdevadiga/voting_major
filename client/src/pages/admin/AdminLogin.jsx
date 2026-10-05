import { useState } from "react";
import { adminLogin } from "../../lib/adminApi";
import { Button, Card, CardHeader, Field, inputClass } from "../../components/ui";

function AdminLogin({ onSignedIn }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await adminLogin(password);
      onSignedIn();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-120 sm:pt-6">
      <Card>
        <CardHeader title="Administrator sign in" subtitle="Manage the electoral roll and the election phases." />
        <form onSubmit={submit} className="space-y-5">
          <Field id="admin-password" label="Password" error={error}>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Button type="submit" block busy={busy} disabled={busy || !password}>
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default AdminLogin;

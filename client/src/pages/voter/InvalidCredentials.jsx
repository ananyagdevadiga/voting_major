import { Link, useLocation } from "react-router-dom";
import { Check, ShieldAlert } from "lucide-react";
import Layout from "../../components/Layout";
import { StatusCard, buttonClass } from "../../components/ui";

function InvalidCredentials() {
  const location = useLocation();

  const message =
    location.state?.message || "The voter credentials could not be verified.";

  return (
    <Layout>
      <StatusCard
        tone="error"
        icon={ShieldAlert}
        title="Credential not recognised"
        actions={
          <>
            <Link to="/verify-voter" className={buttonClass("primary", true)}>
              Try again
            </Link>
            <Link to="/" className={buttonClass("ghost", true)}>
              Back to home
            </Link>
          </>
        }
      >
        <p>{message}</p>
        <ul className="mt-5! space-y-2 rounded-xl bg-slate-50 p-4 text-left text-slate-600">
          {["Copied in full", "From this election", "Registered before the deadline"].map((item) => (
            <li key={item} className="flex items-center gap-2.5">
              <Check size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </StatusCard>
    </Layout>
  );
}

export default InvalidCredentials;

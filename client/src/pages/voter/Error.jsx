import { Link, useLocation } from "react-router-dom";
import { XCircle } from "lucide-react";
import Layout from "../../components/Layout";
import { StatusCard, buttonClass } from "../../components/ui";

function Error() {
  const location = useLocation();

  const message =
    location.state?.message ||
    "Your vote could not be submitted.";

  return (
    <Layout>
      <StatusCard
        tone="error"
        icon={XCircle}
        title="Vote not submitted"
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
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-rose-800">{message}</p>
        <p>It's safe to try again.</p>
      </StatusCard>
    </Layout>
  );
}

export default Error;

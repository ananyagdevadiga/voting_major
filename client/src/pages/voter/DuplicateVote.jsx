import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import Layout from "../../components/Layout";
import { StatusCard, buttonClass } from "../../components/ui";

function DuplicateVote() {
  return (
    <Layout>
      <StatusCard
        tone="warning"
        icon={ShieldCheck}
        title="You've already voted"
        actions={
          <>
            <Link to="/results" className={buttonClass("primary", true)}>
              View results
            </Link>
            <Link to="/" className={buttonClass("ghost", true)}>
              Back to home
            </Link>
          </>
        }
      >
        <p>This credential has already been used. Your original vote is unchanged.</p>
      </StatusCard>
    </Layout>
  );
}

export default DuplicateVote;

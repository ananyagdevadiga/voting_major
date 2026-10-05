import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, CheckCircle2, Copy } from "lucide-react";
import Layout from "../../components/Layout";
import { Card, ResultsList, StatusCard, buttonClass } from "../../components/ui";

function Success() {
  const location = useLocation();
  const [copied, setCopied] = useState(false);

  const { candidate, results, transactionHash, blockNumber } = location.state || {};

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(transactionHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the hash is still selectable on the page.
    }
  };

  return (
    <Layout>
      <StatusCard
        tone="success"
        icon={CheckCircle2}
        title="Vote recorded"
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
        {candidate && (
          <p>
            You voted for <span className="font-medium text-slate-900">{candidate.name}</span>.
          </p>
        )}

        {transactionHash && (
          <dl className="mt-6! divide-y divide-slate-100 rounded-xl border border-slate-200 text-left">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="shrink-0 text-slate-500">Transaction</dt>
              <dd className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-mono text-xs text-slate-800" title={transactionHash}>
                  {transactionHash}
                </span>
                <button
                  type="button"
                  onClick={copyHash}
                  className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={copied ? "Copied" : "Copy transaction hash"}
                >
                  {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                </button>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-slate-500">Block</dt>
              <dd className="font-mono text-xs text-slate-800">{blockNumber}</dd>
            </div>
          </dl>
        )}
      </StatusCard>

      {results && (
        <Card className="mt-6">
          <h2 className="mb-5 font-semibold">Current standings</h2>
          <ResultsList candidates={results.candidates} total={results.total} />
        </Card>
      )}
    </Layout>
  );
}

export default Success;

import { useEffect, useState } from "react";
import { fetchResults } from "../lib/api";
import Layout from "../components/Layout";
import { Card, Notice, ResultsList, Spinner } from "../components/ui";

function Results() {
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchResults()
      .then((data) => {
        if (data.success === false) {
          throw new Error(data.message || "Failed to fetch results");
        }
        setResults(data);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Layout width="medium">
      <div className="mb-6 px-1">
        <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
        <p className="mt-1.5 text-sm text-slate-500">Live tally from the smart contract.</p>
      </div>

      <Card>
        {error ? (
          <Notice tone="error" title="Results are unavailable">
            {error}
          </Notice>
        ) : results ? (
          <ResultsList candidates={results.candidates} total={results.total} />
        ) : (
          <Spinner label="Reading the tally…" />
        )}
      </Card>
    </Layout>
  );
}

export default Results;

import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Register from "./pages/voter/Register";
import VerifyVoter from "./pages/voter/VerifyVoter";
import Vote from "./pages/voter/Vote";
import Processing from "./pages/voter/Processing";
import Success from "./pages/voter/Success";
import Error from "./pages/voter/Error";
import Results from "./pages/Results";
import InvalidCredentials from "./pages/voter/InvalidCredentials";
import DuplicateVote from "./pages/voter/DuplicateVote";
import { Spinner } from "./components/ui";

// Voters never download the admin portal's code.
const Admin = lazy(() => import("./pages/admin/Admin"));

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/register" element={<Register />} />
      <Route path="/verify-voter" element={<VerifyVoter />} />
      <Route path="/verify" element={<VerifyVoter />} />

      <Route path="/vote" element={<Vote />} />
      <Route path="/processing" element={<Processing />} />
      <Route path="/success" element={<Success />} />
      <Route path="/duplicate-vote" element={<DuplicateVote />} />
      <Route path="/error" element={<Error />} />
      <Route path="/results" element={<Results />} />

      <Route
        path="/invalid-credentials"
        element={<InvalidCredentials />}
      />

      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<Spinner label="Loading the admin portal…" />}>
            <Admin />
          </Suspense>
        }
      />
    </Routes>
  );
}

export default App;

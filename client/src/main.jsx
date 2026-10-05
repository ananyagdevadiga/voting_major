import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import { VoterSessionProvider } from "./context/VoterSession.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <VoterSessionProvider>
        <App />
      </VoterSessionProvider>
    </BrowserRouter>
  </React.StrictMode>
);

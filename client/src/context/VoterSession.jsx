import { createContext, useCallback, useContext, useMemo, useState } from "react";

// Holds the verified voter's credential in memory only. It is deliberately not
// passed through router state (which browsers persist in history) or storage.
const VoterSessionContext = createContext(null);

export function VoterSessionProvider({ children }) {
  const [session, setSession] = useState(null);

  const clearSession = useCallback(() => setSession(null), []);

  const value = useMemo(
    () => ({ session, setSession, clearSession }),
    [session, clearSession]
  );

  return (
    <VoterSessionContext.Provider value={value}>
      {children}
    </VoterSessionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVoterSession() {
  const context = useContext(VoterSessionContext);

  if (!context) {
    throw new Error("useVoterSession must be used inside VoterSessionProvider");
  }

  return context;
}

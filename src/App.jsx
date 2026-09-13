import React, { useEffect, useState } from "react";
import { DashboardWorkspace } from "./features/dashboard/DashboardWorkspace.jsx";

export default function App({ initialViewModel }) {
  const [state, setState] = useState(() => initialViewModel
    ? { status: "ready", viewModel: initialViewModel, error: null }
    : { status: "loading", viewModel: null, error: null });

  useEffect(() => {
    if (initialViewModel) return undefined;
    const controller = new AbortController();
    fetch("/api/dashboard", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Dashboard request failed with HTTP ${response.status}.`);
        return response.json();
      })
      .then((viewModel) => setState({ status: "ready", viewModel, error: null }))
      .catch((error) => {
        if (error.name !== "AbortError") setState({ status: "error", viewModel: null, error });
      });
    return () => controller.abort();
  }, [initialViewModel]);

  if (state.status === "loading") return <main className="status-shell" aria-live="polite"><p>Loading current market signals…</p></main>;
  if (state.status === "error") return (
    <main className="status-shell" role="alert">
      <h1>Market Timing Dashboard</h1>
      <p>Current signals could not be loaded. Please try again shortly.</p>
    </main>
  );
  return <DashboardWorkspace initialSnapshot={state.viewModel} />;
}

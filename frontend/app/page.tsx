"use client";

import { useCallback, useEffect, useState } from "react";

type Strategy = "greedy" | "cautious" | "random";
type Agent = { name: string; strategy: Strategy };
type Trace = { sequence: number; round: number; agent: string; strategy: string; observation: { value: number; target: number }; action: number; reasoning: string; value_before: number; value_after: number };
type Result = { final_value: number; target_reached: boolean; rounds: number; total_actions: number; scores: { agent: string; contribution: number }[] };
type Experiment = { id: number | string; name: string; seed: number; target: number; max_rounds: number; agents: Agent[]; status: string; result: Result | null; trace: Trace[]; created_at: string };
type Form = { name: string; seed: string; target: string; max_rounds: string; agents: [Agent, Agent] };

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const initial: Form = { name: "", seed: "42", target: "100", max_rounds: "20", agents: [{ name: "Agent Alpha", strategy: "greedy" }, { name: "Agent Beta", strategy: "cautious" }] };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`${API}${path}`, { ...options, headers: { "Content-Type": "application/json", ...options?.headers }, cache: "no-store" }); }
  catch { throw new Error(`Cannot connect to the API at ${API}. Check that it is running.`); }
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) message = body.detail.map((item: { msg?: string; loc?: (string | number)[] }) => `${item.loc?.slice(1).join(" → ") || "Input"}: ${item.msg || "Invalid value"}`).join("; ");
    } catch { /* retain HTTP status */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function validate(form: Form): string | null {
  if (!form.name.trim() || form.name.trim().length > 100) return "Enter an experiment name of 1–100 characters.";
  if (form.agents.some(a => !a.name.trim() || a.name.trim().length > 100)) return "Enter a name of 1–100 characters for each agent.";
  if (form.agents[0].name.trim().toLowerCase() === form.agents[1].name.trim().toLowerCase()) return "Agent names must be distinct.";
  for (const [label, value, min, max] of [["Seed", form.seed, 0, 2147483647], ["Target", form.target, 2, 1000], ["Round limit", form.max_rounds, 1, 100]] as const) {
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) return `${label} must be an integer between ${min} and ${max}.`;
  }
  return null;
}

export default function Home() {
  const [form, setForm] = useState<Form>(initial);
  const [history, setHistory] = useState<Experiment[]>([]);
  const [selected, setSelected] = useState<Experiment | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [busy, setBusy] = useState<"create" | "run" | "load" | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try { setHistory(await request<Experiment[]>("/experiments")); setHistoryFailed(false); }
    catch (e) { setHistoryFailed(true); setError((e as Error).message); }
    finally { setLoadingHistory(false); }
  }, []);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  async function select(id: Experiment["id"]) {
    setBusy("load"); setError("");
    try { const item = await request<Experiment>(`/experiments/${encodeURIComponent(id)}`); setSelected(item); setStep(0); setCreating(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const problem = validate(form); if (problem) { setError(problem); return; }
    setBusy("create");
    try {
      const item = await request<Experiment>("/experiments", { method: "POST", body: JSON.stringify({ name: form.name.trim(), seed: Number(form.seed), target: Number(form.target), max_rounds: Number(form.max_rounds), agents: form.agents.map(a => ({ ...a, name: a.name.trim() })) }) });
      setSelected(item); setCreating(false); setStep(0); await loadHistory();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  async function run() {
    if (!selected) return; setBusy("run"); setError("");
    try { const item = await request<Experiment>(`/experiments/${encodeURIComponent(selected.id)}/run`, { method: "POST" }); setSelected(item); setStep(0); await loadHistory(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  function updateAgent(index: 0 | 1, change: Partial<Agent>) {
    setForm(current => { const agents: [Agent, Agent] = [{ ...current.agents[0] }, { ...current.agents[1] }]; agents[index] = { ...agents[index], ...change }; return { ...current, agents }; });
  }
  const trace = selected?.trace || [];
  const event = step > 0 ? trace[step - 1] : null;
  const displayedValue = event ? event.value_after : 0;

  return <div className="shell">
    <header className="topbar"><a className="brand" href="/" aria-label="AgentArena home"><span className="brand-mark">A<span>↗</span></span><span>Agent<span className="brand-muted">Arena</span></span></a><div className="top-right"><span className="live-dot" /> LOCAL / SIMULATED <span className="top-divider" /> RESEARCH WORKBENCH <span className="version">M1</span></div></header>
    <div className="workspace">
      <aside className="sidebar" aria-label="Experiment history"><div className="side-heading"><div><span className="eyebrow">WORKSPACE / 01</span><h2>Experiments</h2></div><span className="count">{history.length.toString().padStart(2, "0")}</span></div><button className="new-button" onClick={() => { setCreating(true); setSelected(null); setError(""); }} disabled={!!busy}><span>+</span> New experiment</button><div className="history-label">RUN HISTORY <span>NEWEST FIRST</span></div>
        {loadingHistory ? <p className="side-message" role="status">Loading experiments…</p> : historyFailed ? <div className="side-message">History could not be loaded. <button className="retry" onClick={() => void loadHistory()}>Retry</button></div> : history.length === 0 ? <p className="side-message">No experiments yet.<br />Create one to get started.</p> : <div className="history-list">{history.map(item => <button key={item.id} className={`history-item ${!creating && selected?.id === item.id ? "active" : ""}`} onClick={() => void select(item.id)} disabled={!!busy} aria-current={!creating && selected?.id === item.id ? "true" : undefined}><span className="history-name">{item.name}</span><span className="history-meta"><span className={`status-dot ${item.status === "completed" ? "done" : ""}`} />{item.status} <span>↗</span></span></button>)}</div>}
        <div className="side-footer"><span>●</span> YOUR LOCAL LAB<br /><small>Experiments stay on this machine.</small></div>
      </aside>
      <main className="main"><div className="main-inner"><div className="breadcrumb">WORKSPACE <span>/</span> {creating ? "NEW EXPERIMENT" : "EXPERIMENT DETAIL"}</div>
        {error && <div className="error" role="alert"><span>!</span><div>{error}</div><button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
        {creating ? <><div className="hero"><div><div className="eyebrow accent">THE SIMULATION LAB <span> / 01</span></div><h1>Set the stage<span>.</span></h1><p>Configure two agents, then see how they work together to reach a number.</p></div><div className="hero-index" aria-hidden="true">01<span> / SETUP</span></div></div>
          <form onSubmit={create} noValidate><section className="panel"><div className="section-head"><div><span className="section-number">01</span><h2>Experiment setup</h2></div><p>The parameters of your simulation.</p></div><div className="form-grid"><label className="field wide">Experiment name <span>Give this run a recognizable name.</span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. First contact" maxLength={100} required /></label><label className="field">Seed <span>For reproducible runs</span><input type="number" min="0" max="2147483647" step="1" value={form.seed} onChange={e => setForm({ ...form, seed: e.target.value })} /></label><label className="field">Target <span>Number to reach</span><input type="number" min="2" max="1000" step="1" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} /></label><label className="field">Round limit <span>Maximum 100 rounds</span><input type="number" min="1" max="100" step="1" value={form.max_rounds} onChange={e => setForm({ ...form, max_rounds: e.target.value })} /></label></div></section>
          <section className="panel agents-panel"><div className="section-head"><div><span className="section-number">02</span><h2>Meet the agents</h2></div><p>Two simulated agents take turns.</p></div><div className="agent-grid">{form.agents.map((agent, i) => <div className="agent-card" key={i}><div className="agent-top"><span className={`agent-icon agent-${i}`}>{i === 0 ? "◒" : "◐"}</span><div><span className="eyebrow">PARTICIPANT 0{i + 1}</span><h3>Agent {i + 1}</h3></div><span className="agent-tag">SIMULATED</span></div><label className="field">Agent {i + 1} name<input value={agent.name} maxLength={100} onChange={e => updateAgent(i as 0 | 1, { name: e.target.value })} /></label><label className="field">Agent {i + 1} strategy<select value={agent.strategy} onChange={e => updateAgent(i as 0 | 1, { strategy: e.target.value as Strategy })}><option value="greedy">Greedy</option><option value="cautious">Cautious</option><option value="random">Random</option></select></label><p className="strategy-note">{agent.strategy === "greedy" ? "Makes larger moves toward the target." : agent.strategy === "cautious" ? "Takes measured steps toward the target." : "Chooses moves using the experiment seed."}</p></div>)}</div></section><div className="form-action"><p><span>◈</span> Creating saves a draft. You choose when to run it.</p><button className="primary" type="submit" disabled={!!busy}>{busy === "create" ? "Creating…" : "Create experiment"} <span>↗</span></button></div></form></> : selected && <><div className="hero detail-hero"><div><div className="eyebrow accent">EXPERIMENT / {String(selected.id).slice(0, 8)}</div><h1>{selected.name}<span>.</span></h1><p>Two agents. One target. Every decision on the record.</p></div><span className={`status-pill ${selected.status === "completed" ? "complete" : ""}`}><span className="status-dot" />{busy === "run" ? "RUNNING" : selected.status.toUpperCase()}</span></div>
          <section className="panel detail-panel"><div className="section-head"><div><span className="section-number">01</span><h2>Run configuration</h2></div><p>Saved experiment parameters</p></div><div className="config-strip"><div><span>SEED</span><strong>{selected.seed}</strong></div><div><span>TARGET</span><strong>{selected.target}</strong></div><div><span>ROUND LIMIT</span><strong>{selected.max_rounds}</strong></div><div><span>AGENTS</span><strong>{selected.agents.length}</strong></div></div><div className="detail-agents">{selected.agents.map((agent, i) => <div key={`${agent.name}-${i}`}><span className={`small-agent agent-${i}`}>{i === 0 ? "◒" : "◐"}</span><strong>{agent.name}</strong><span>{agent.strategy}</span></div>)}</div>{selected.status === "draft" && <div className="run-row"><p>Ready when you are. Running saves the result and trace.</p><button className="primary" onClick={() => void run()} disabled={!!busy}>{busy === "run" ? "Running…" : "Run experiment"} <span>↗</span></button></div>}{selected.status === "running" && <p className="empty-state" role="status">This experiment is running. Select it again to refresh its status.</p>}{selected.status === "error" && <p className="empty-state" role="alert">This experiment is in an error state. Create a new experiment to try again.</p>}</section>
          {selected.result ? <><section className="panel results-panel"><div className="section-head"><div><span className="section-number">02</span><h2>Results</h2></div><p>Recorded outcome</p></div><div className="results-grid"><div className="result-lead"><span>FINAL VALUE / TARGET</span><strong>{selected.result.final_value}<small> / {selected.target}</small></strong><div className={`outcome ${selected.result.target_reached ? "reached" : ""}`}>{selected.result.target_reached ? "● Target reached" : "○ Target not reached"}</div></div><div className="metric"><span>ROUNDS</span><strong>{selected.result.rounds}</strong></div><div className="metric"><span>ACTIONS</span><strong>{selected.result.total_actions}</strong></div><div className="contributions"><span>CONTRIBUTIONS</span>{selected.result.scores.map((score, i) => <div key={`${score.agent}-${i}`}><span>{score.agent}</span><strong>+{score.contribution}</strong></div>)}</div></div></section>
          <section className="panel replay-panel"><div className="section-head"><div><span className="section-number">03</span><h2>Trace replay</h2></div><p>Walk through every decision.</p></div>{trace.length ? <><div className="replay-top"><div><span className="eyebrow">PLAYHEAD</span><strong>{String(step).padStart(2, "0")} <span>/ {String(trace.length).padStart(2, "0")}</span></strong></div><div className="replay-controls"><button onClick={() => setStep(0)} disabled={step === 0}>Reset</button><button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>← Previous</button><button onClick={() => setStep(s => Math.min(trace.length, s + 1))} disabled={step === trace.length}>Next →</button></div></div><div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={trace.length} aria-valuenow={step} aria-label={`Replay step ${step} of ${trace.length}`}><div style={{ width: `${step / trace.length * 100}%` }} /></div><div className="trace-body" aria-live="polite">{event ? <><div className="trace-meta"><span>ROUND {event.round}</span><span>EVENT {event.sequence}</span><span>{event.strategy}</span></div><div className="trace-summary"><div><span className="eyebrow">AGENT</span><h3>{event.agent}</h3></div><div className="state-change"><span>{event.value_before}</span><span>+{event.action} →</span><strong>{event.value_after}</strong></div></div><div className="trace-details"><div><span>OBSERVATION</span><p>Value {event.observation.value} / target {event.observation.target}</p></div><div><span>REASONING</span><p>{event.reasoning}</p></div></div></> : <div className="trace-start"><div><span className="eyebrow">BEFORE THE FIRST ACTION</span><h3>At the starting line.</h3><p>Step forward to inspect the first decision.</p></div><div className="state-change"><span>VALUE</span><strong>{displayedValue}</strong></div></div>}</div></> : <p className="empty-state">No trace events were recorded for this experiment.</p>}</section></> : selected.status === "draft" ? <section className="panel awaiting"><span className="await-icon">↗</span><div><span className="eyebrow">AWAITING RUN</span><h2>Your experiment is ready.</h2><p>Run the experiment to see its outcome and inspect each decision.</p></div></section> : null}</>}
        <footer className="main-footer"><span>AGENTARENA / LOCAL RESEARCH WORKBENCH</span><span>BUILT FOR CURIOSITY ↗</span></footer>
      </div></main>
    </div></div>;
}

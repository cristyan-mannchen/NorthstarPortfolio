"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, FileSpreadsheet, LoaderCircle, ShieldCheck, UploadCloud, XCircle } from "lucide-react";

type Portfolio = { id: string; name: string };
type ImportRow = {
  id: number; source_worksheet: string; source_row_number: number;
  normalized_data: Record<string, unknown>; validation_errors: string[]; validation_warnings: string[];
  mapping_confidence: number; instrument_match_confidence: number; duplicate_status: string;
  duplicate_explanation?: string; resolution_status: string;
};
type Batch = { id: string; filename: string; institution_name?: string; dataset_type: string; overall_confidence: number; status: string; total_rows: number; valid_rows: number; warning_rows: number; invalid_rows: number; duplicate_rows: number };

export default function ImportWorkspace({ portfolios }: { portfolios: Portfolio[] }) {
  const [stage, setStage] = useState<"upload" | "analyzing" | "review" | "complete">("upload");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number; status: string } | null>(null);

  async function loadBatch(batchId: string) {
    const response = await fetch(`/api/imports/${batchId}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Unable to load import review.");
    setBatch(payload.batch); setRows(payload.rows); setStage("review");
  }
  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setStage("analyzing");
    try {
      const response = await fetch("/api/imports/analyze", { method: "POST", body: new FormData(event.currentTarget) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to analyze this file.");
      await loadBatch(payload.batchId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to analyze this file."); setStage("upload"); }
  }
  async function rejectRow(rowId: number) {
    if (!batch) return;
    const response = await fetch(`/api/imports/${batch.id}/rows/${rowId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ resolutionStatus: "rejected" }) });
    if (!response.ok) { const payload = await response.json(); setError(payload.error ?? "Unable to reject row."); return; }
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, resolution_status: "rejected" } : row));
  }
  async function confirm() {
    if (!batch) return; setError(null);
    const response = await fetch(`/api/imports/${batch.id}/confirm`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error ?? "Unable to complete import.");
    setResult(payload); setStage("complete");
  }
  const blockingRows = rows.filter((row) => row.validation_errors.length && row.resolution_status !== "rejected");

  return <main className="import-page"><div className="import-shell">
    <header className="import-header"><Link href="/"><ArrowLeft size={17}/>Portfolio</Link><div><strong>Northstar Import</strong><span>Private, staged, and auditable</span></div><ShieldCheck size={20}/></header>
    <section className="import-title"><p className="eyebrow">INTELLIGENT IMPORTER</p><h1>Import investments from almost any platform</h1><p>Upload a CSV, TXT, XLSX, or XLS file. Northstar detects its structure and shows normalized results before anything is written.</p></section>
    <div className="import-steps">{["Upload", "Analyze", "Review", "Complete"].map((label, index) => <div key={label} className={index <= ["upload","analyzing","review","complete"].indexOf(stage) ? "active" : ""}><i>{index + 1}</i><span>{label}</span></div>)}</div>
    {error && <div className="import-error"><AlertTriangle size={18}/><span>{error}</span></div>}

    {stage === "upload" && <form className="import-card upload-card" onSubmit={analyze}>
      <div className="upload-icon"><UploadCloud size={31}/></div><h2>Choose an investment file</h2><p>Files are analyzed securely. The original file is not retained after analysis.</p>
      <label className="file-picker"><FileSpreadsheet size={18}/><span>Select CSV, TXT, XLSX, or XLS</span><input name="file" type="file" accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required/></label>
      <label className="portfolio-picker">Import into<select name="portfolioId" required defaultValue={portfolios[0]?.id}>{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select><ChevronDown size={16}/></label>
      <button className="import-primary" disabled={!portfolios.length}>Analyze file</button><small>Maximum 10 MB · Formulas and macros are never executed</small>
    </form>}
    {stage === "analyzing" && <section className="import-card analyzing-card"><LoaderCircle className="spin" size={36}/><h2>Understanding your file</h2><p>Detecting tables, headers, financial fields, instruments, and duplicates…</p></section>}
    {stage === "review" && batch && <>
      <section className="import-summary import-card"><div><small>DETECTED SOURCE</small><strong>{batch.institution_name || "Unknown institution"}</strong><span>{batch.filename}</span></div><div><small>DATASET</small><strong>{batch.dataset_type.replaceAll("_", " ")}</strong><span>{batch.total_rows} normalized rows</span></div><div><small>CONFIDENCE</small><strong>{Math.round(batch.overall_confidence * 100)}%</strong><span>{batch.overall_confidence >= .9 ? "High confidence" : batch.overall_confidence >= .7 ? "Review recommended" : "Manual review required"}</span></div><div><small>RESULTS</small><strong>{batch.valid_rows} ready</strong><span>{batch.duplicate_rows} duplicates · {batch.invalid_rows} invalid</span></div></section>
      <section className="import-card review-card"><div className="review-head"><div><h2>Normalized preview</h2><p>These are the financial records Northstar understood—not just the raw columns.</p></div><span>{rows.length} rows</span></div>
        <div className="import-table-wrap"><table className="import-table"><thead><tr><th>ROW</th><th>INSTRUMENT</th><th>TYPE</th><th>DATE</th><th>QUANTITY</th><th>UNIT PRICE</th><th>AMOUNT</th><th>CURRENCY</th><th>STATUS</th><th></th></tr></thead><tbody>{rows.map((row) => { const data = row.normalized_data; const rejected = row.resolution_status === "rejected"; return <tr key={row.id} className={rejected ? "rejected" : ""}><td>{row.source_worksheet} · {row.source_row_number}</td><td><b>{String(data.symbol ?? "Unresolved")}</b><small>{String(data.instrumentName ?? "")}</small></td><td>{String(data.transactionType ?? "—").replaceAll("_", " ")}</td><td>{String(data.tradeDate ?? "Ambiguous")}</td><td>{String(data.quantity ?? "—")}</td><td>{data.unitPrice == null ? "—" : String(data.unitPrice)}</td><td>{data.netAmount == null ? data.grossAmount == null ? "—" : String(data.grossAmount) : String(data.netAmount)}</td><td>{String(data.currency ?? "—")}</td><td>{rejected ? <span className="row-status muted"><XCircle size={13}/>Skipped</span> : row.validation_errors.length ? <span className="row-status bad"><AlertTriangle size={13}/>{row.validation_errors.length} issues</span> : row.duplicate_status !== "new" ? <span className="row-status muted">Duplicate</span> : <span className="row-status good"><CheckCircle2 size={13}/>Ready</span>}<small>{row.validation_errors[0] ?? row.validation_warnings[0] ?? row.duplicate_explanation ?? ""}</small></td><td>{row.validation_errors.length && !rejected ? <button onClick={() => rejectRow(row.id)}>Skip row</button> : null}</td></tr>})}</tbody></table></div>
        <div className="review-actions"><div>{blockingRows.length ? <><AlertTriangle size={16}/>{blockingRows.length} invalid rows must be resolved or skipped.</> : <><CheckCircle2 size={16}/>All importable rows passed deterministic validation.</>}</div><button className="import-primary" disabled={blockingRows.length > 0} onClick={confirm}>Confirm import</button></div>
      </section>
    </>}
    {stage === "complete" && result && <section className="import-card complete-card"><CheckCircle2 size={44}/><h2>Import complete</h2><p>{result.imported} records were imported and the portfolio was recalculated. {result.skipped ? `${result.skipped} duplicate or rejected rows were skipped.` : ""}</p><div><Link href="/">View portfolio</Link><button onClick={() => { setStage("upload"); setBatch(null); setRows([]); }}>Import another file</button></div></section>}
  </div></main>;
}

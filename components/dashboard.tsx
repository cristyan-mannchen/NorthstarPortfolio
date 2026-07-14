"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Bell, ChevronDown, CircleHelp, Download,
  LayoutDashboard, Moon, MoreHorizontal, PieChart, Plus, RefreshCw, Search,
  Settings, ShieldCheck, SlidersHorizontal, Sparkles, Sun, UploadCloud, WalletCards, X,
} from "lucide-react";
import { addPosition, signOut } from "@/app/actions/portfolio";

export type DashboardPosition = {
  id: string;
  name: string; ticker: string; kind: string; units: number; average: number;
  price: number; currency: string; day: number; color: string;
};

const months = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];

const money = (value: number, digits = 0) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

function GrowthChart({ history }: { history: number[] }) {
  const safeHistory = history.length > 1 ? history : [history[0] ?? 0, history[0] ?? 0];
  const minimum = Math.min(...safeHistory);
  const maximum = Math.max(...safeHistory);
  const spread = Math.max(maximum - minimum, 1);
  const points = safeHistory.map((value, index) => `${(index / (safeHistory.length - 1)) * 100},${96 - ((value - minimum) / spread) * 86}`).join(" ");
  return (
    <div className="chart" aria-label="Portfolio value increased over the last year">
      <div className="chart-grid"><i/><i/><i/><i/></div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
        <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#677bff" stopOpacity=".24"/><stop offset="1" stopColor="#677bff" stopOpacity="0"/></linearGradient></defs>
        <polygon points={`0,100 ${points} 100,100`} fill="url(#area)"/>
        <polyline points={points} fill="none" stroke="#6578ff" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div className="chart-tooltip"><span>Latest</span><strong>{money(safeHistory.at(-1) ?? 0, 2)}</strong></div>
      <div className="chart-months">{months.map(m => <span key={m}>{m}</span>)}</div>
    </div>
  );
}

type DashboardProps = {
  portfolioId: string;
  portfolioName: string;
  displayName: string;
  email: string;
  positions: DashboardPosition[];
  history: number[];
  updatedAt: string | null;
};

export default function Dashboard({ portfolioId, portfolioName, displayName, email, positions, history, updatedAt }: DashboardProps) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [range, setRange] = useState("1Y");
  const [modal, setModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState("Overview");
  const total = useMemo(() => positions.reduce((sum, p) => sum + p.units * p.price, 0), [positions]);
  const book = useMemo(() => positions.reduce((sum, p) => sum + p.units * p.average, 0), [positions]);
  const gain = total - book;
  const firstName = displayName.trim().split(/\s+/)[0] || "Investor";
  const initials = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "NS";
  const gainPercent = book > 0 ? (gain / book) * 100 : 0;

  const refresh = () => { setRefreshing(true); window.setTimeout(() => setRefreshing(false), 900); };

  return (
    <main data-theme={theme}>
      <aside>
        <div className="brand"><div className="brand-mark"><span/><span/><span/></div><strong>Northstar</strong></div>
        <button className="portfolio-switch"><div className="avatar">{initials}</div><span><small>Portfolio</small><b>{portfolioName}</b></span><ChevronDown size={15}/></button>
        <nav>
          {[ ["Overview", LayoutDashboard], ["Portfolios", WalletCards], ["Analytics", PieChart] ].map(([label, Icon]) => <button key={label as string} className={view === label ? "active" : ""} onClick={() => setView(label as string)}><Icon size={18}/>{label as string}</button>)}
          <div className="nav-label">Manage</div>
          <button onClick={() => setView("Settings")} className={view === "Settings" ? "active" : ""}><Settings size={18}/>Settings</button>
        </nav>
        <div className="sidebar-bottom"><div className="sync-card"><div><span className="pulse"/>Prices connected</div><small>{updatedAt ? `Updated ${new Date(updatedAt).toLocaleString("en-CA")}` : "Waiting for first price update"}</small></div><button><CircleHelp size={17}/>Help & documentation</button><form action={signOut}><button className="profile" type="submit"><div className="avatar">{initials}</div><span><b>{displayName}</b><small>{email}</small></span><MoreHorizontal size={17}/></button></form></div>
      </aside>

      <section className="shell">
        <header><div className="mobile-brand"><div className="brand-mark"><span/><span/><span/></div><strong>Northstar</strong></div><div className="search"><Search size={17}/><input aria-label="Search investments" placeholder="Search investments..."/><kbd>⌘ K</kbd></div><div className="header-actions"><button aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}</button><button aria-label="Notifications" className="notification"><Bell size={18}/><i/></button><button className="add" onClick={() => setModal(true)}><Plus size={17}/>Add investment</button></div></header>

        <div className="content">
          <div className="title-row"><div><p className="eyebrow">PORTFOLIO OVERVIEW</p><h1>{view === "Overview" ? `Welcome, ${firstName}.` : view}</h1><p>Here’s how your investments are performing.</p></div><div className="title-actions"><Link className="import-link" href="/imports"><UploadCloud size={15}/>Import file</Link><div className="as-of"><span className="pulse"/>{updatedAt ? `Market data as of ${new Date(updatedAt).toLocaleDateString("en-CA")}` : "No market prices yet"}<button onClick={refresh} aria-label="Refresh prices"><RefreshCw size={15} className={refreshing ? "spin" : ""}/></button></div></div></div>

          <div className="metric-grid">
            <article className="metric featured"><div className="metric-top"><span>Total portfolio value</span><WalletCards size={18}/></div><strong>{money(total)}</strong><div className={`metric-change ${gain >= 0 ? "positive" : "negative"}`}><ArrowUpRight size={15}/><b>{gainPercent.toFixed(1)}%</b><span>{gain >= 0 ? "+" : ""}{money(gain, 2)} all time</span></div><div className="micro-bars">{[30,38,31,47,54,48,65,61,70,83,74,91].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div></article>
            <article className="metric"><div className="metric-top"><span>Today’s change</span><span className="status">DAILY</span></div><strong>{money(positions.reduce((sum, p) => sum + p.units * p.price * p.day / 100, 0), 2)}</strong><div className="metric-change"><span>latest available prices</span></div></article>
            <article className="metric"><div className="metric-top"><span>Total gain / loss</span><Sparkles size={18}/></div><strong>{gain >= 0 ? "+" : ""}{money(gain)}</strong><div className={`metric-change ${gain >= 0 ? "positive" : "negative"}`}><ArrowUpRight size={15}/><b>{gainPercent.toFixed(1)}%</b><span>since inception</span></div></article>
            <article className="metric"><div className="metric-top"><span>Tracked holdings</span><SlidersHorizontal size={18}/></div><strong>{positions.length}</strong><div className="metric-change"><span>across your portfolio</span></div></article>
          </div>

          <div className="dashboard-grid">
            <article className="panel growth-panel"><div className="panel-head"><div><h2>Portfolio growth</h2><p>Market value over time</p></div><div className="ranges">{["1W","1M","3M","6M","1Y","ALL"].map(r=><button key={r} className={range===r?"active":""} onClick={()=>setRange(r)}>{r}</button>)}</div></div><GrowthChart history={history.length ? history : [total]}/></article>
            <article className="panel allocation"><div className="panel-head"><div><h2>Asset allocation</h2><p>Current portfolio mix</p></div><button><MoreHorizontal size={18}/></button></div><div className="donut-wrap"><div className="donut"><div><strong>{money(total/1000, 1)}k</strong><span>Total</span></div></div></div><div className="legend">{positions.map((p,i)=>{const v=p.units*p.price;return <div key={p.ticker}><i style={{background:p.color}}/><span>{p.kind === "ETF" ? (i===1?"U.S. equity":"Fixed income") : p.kind === "Stock"?"Canadian equity":"Mutual funds"}</span><b>{((v/total)*100).toFixed(1)}%</b><small>{money(v)}</small></div>})}</div></article>
          </div>

          {positions.length === 0 && <article className="panel empty-state"><WalletCards size={28}/><h2>Your portfolio is ready</h2><p>Add your first mutual fund, ETF, or stock to begin tracking performance.</p><button className="add" onClick={() => setModal(true)}><Plus size={17}/>Add first investment</button></article>}

          <article className="panel holdings"><div className="panel-head"><div><h2>Your investments</h2><p>{positions.length} holdings across 3 asset classes</p></div><div><button className="secondary"><Download size={15}/>Export</button><button className="secondary"><SlidersHorizontal size={15}/>Filter</button></div></div><div className="table-wrap"><table><thead><tr><th>INVESTMENT</th><th>UNITS</th><th>AVG. PRICE</th><th>CURRENT PRICE</th><th>MARKET VALUE</th><th>GAIN / LOSS</th><th>TODAY</th><th></th></tr></thead><tbody>{positions.map(p=>{const mv=p.units*p.price;const pg=mv-p.units*p.average;return <tr key={p.ticker}><td><span className="ticker" style={{background:p.color}}>{p.ticker.slice(0,2)}</span><span><b>{p.name}</b><small>{p.ticker} · {p.kind}</small></span></td><td>{p.units.toLocaleString("en-CA")}</td><td>{money(p.average,2)}</td><td>{money(p.price,2)}</td><td><b>{money(mv)}</b></td><td className={pg>=0?"positive":"negative"}><b>{pg>=0?"+":""}{money(pg)}</b><small>{pg>=0?"+":""}{((p.price/p.average-1)*100).toFixed(1)}%</small></td><td className={p.day>=0?"positive":"negative"}>{p.day>=0?"+":""}{p.day.toFixed(2)}%</td><td><button><MoreHorizontal size={17}/></button></td></tr>})}</tbody></table></div><button className="view-all">View all investments →</button></article>
          <footer><span><ShieldCheck size={15}/>Read-only tracking · Bank-grade encryption</span><span>Data sources: RBC GAM & market data providers</span></footer>
        </div>
      </section>

      {modal && <div className="modal-backdrop" onMouseDown={()=>setModal(false)}><form className="modal" action={addPosition} onMouseDown={e=>e.stopPropagation()}><input type="hidden" name="portfolioId" value={portfolioId}/><div className="modal-head"><div><h2>Add investment</h2><p>Track a new fund, ETF, or stock.</p></div><button type="button" onClick={()=>setModal(false)}><X/></button></div><label>Ticker or fund code<input name="symbol" autoFocus placeholder="e.g. RBF5380" required maxLength={20}/></label><label>Investment name<input name="name" placeholder="PH&N U.S. Multi-Style Fund" required maxLength={200}/></label><div className="form-grid"><label>Number of units<input name="units" type="number" min="0.00000001" step="any" placeholder="0.00" required/></label><label>Average price<input name="averagePrice" type="number" min="0" step="any" placeholder="$0.00" required/></label></div><div className="form-grid"><label>Asset type<select name="assetType" defaultValue="mutual_fund"><option value="mutual_fund">Mutual fund</option><option value="etf">ETF</option><option value="stock">Stock</option><option value="crypto">Crypto</option><option value="other">Other</option></select></label><label>Currency<select name="currency" defaultValue="CAD"><option>CAD</option><option>USD</option></select></label></div><label>Purchase date<input name="purchaseDate" type="date"/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setModal(false)}>Cancel</button><button className="add">Add investment</button></div></form></div>}
    </main>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, Bell, ChevronDown, CircleHelp, Download,
  LayoutDashboard, Moon, MoreHorizontal, PieChart, Plus, RefreshCw, Search,
  Settings, ShieldCheck, SlidersHorizontal, Sparkles, Sun, WalletCards, X,
} from "lucide-react";

type Position = {
  name: string; ticker: string; kind: string; units: number; average: number;
  price: number; currency: string; day: number; color: string;
};

const positions: Position[] = [
  { name: "PH&N U.S. Multi-Style All-Cap Equity Fund", ticker: "RBF5380", kind: "Mutual fund", units: 842.63, average: 23.61, price: 28.69, currency: "CAD", day: 0.64, color: "#566fff" },
  { name: "Vanguard S&P 500 Index ETF", ticker: "VFV", kind: "ETF", units: 112, average: 118.42, price: 142.68, currency: "CAD", day: 0.81, color: "#26c995" },
  { name: "iShares Core Canadian Universe Bond", ticker: "XBB", kind: "ETF", units: 220, average: 29.84, price: 28.91, currency: "CAD", day: -0.12, color: "#f5b544" },
  { name: "Royal Bank of Canada", ticker: "RY", kind: "Stock", units: 76, average: 139.18, price: 191.42, currency: "CAD", day: 0.35, color: "#b06af3" },
];

const history = [58, 61, 60, 65, 68, 67, 73, 72, 76, 81, 79, 85, 88, 92, 90, 96, 100, 104, 102, 109, 113, 117, 121, 126];
const months = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];

const money = (value: number, digits = 0) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

function GrowthChart() {
  const points = history.map((value, index) => `${(index / (history.length - 1)) * 100},${96 - ((value - 52) / 82) * 86}`).join(" ");
  return (
    <div className="chart" aria-label="Portfolio value increased over the last year">
      <div className="chart-grid"><i/><i/><i/><i/></div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
        <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#677bff" stopOpacity=".24"/><stop offset="1" stopColor="#677bff" stopOpacity="0"/></linearGradient></defs>
        <polygon points={`0,100 ${points} 100,100`} fill="url(#area)"/>
        <polyline points={points} fill="none" stroke="#6578ff" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div className="chart-tooltip"><span>Jul 11, 2026</span><strong>$59,284.12</strong></div>
      <div className="chart-months">{months.map(m => <span key={m}>{m}</span>)}</div>
    </div>
  );
}

export default function Home() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [range, setRange] = useState("1Y");
  const [modal, setModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState("Overview");
  const total = useMemo(() => positions.reduce((sum, p) => sum + p.units * p.price, 0), []);
  const book = useMemo(() => positions.reduce((sum, p) => sum + p.units * p.average, 0), []);
  const gain = total - book;

  const refresh = () => { setRefreshing(true); window.setTimeout(() => setRefreshing(false), 900); };

  return (
    <main data-theme={theme}>
      <aside>
        <div className="brand"><div className="brand-mark"><span/><span/><span/></div><strong>Northstar</strong></div>
        <button className="portfolio-switch"><div className="avatar">MG</div><span><small>Portfolio</small><b>My investments</b></span><ChevronDown size={15}/></button>
        <nav>
          {[ ["Overview", LayoutDashboard], ["Portfolios", WalletCards], ["Analytics", PieChart] ].map(([label, Icon]) => <button key={label as string} className={view === label ? "active" : ""} onClick={() => setView(label as string)}><Icon size={18}/>{label as string}</button>)}
          <div className="nav-label">Manage</div>
          <button onClick={() => setView("Settings")} className={view === "Settings" ? "active" : ""}><Settings size={18}/>Settings</button>
        </nav>
        <div className="sidebar-bottom"><div className="sync-card"><div><span className="pulse"/>Prices up to date</div><small>Updated today at 6:12 PM ET</small></div><button><CircleHelp size={17}/>Help & documentation</button><div className="profile"><div className="avatar">MG</div><span><b>Marc Gauthier</b><small>marc@example.com</small></span><MoreHorizontal size={17}/></div></div>
      </aside>

      <section className="shell">
        <header><div className="mobile-brand"><div className="brand-mark"><span/><span/><span/></div><strong>Northstar</strong></div><div className="search"><Search size={17}/><input aria-label="Search investments" placeholder="Search investments..."/><kbd>⌘ K</kbd></div><div className="header-actions"><button aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}</button><button aria-label="Notifications" className="notification"><Bell size={18}/><i/></button><button className="add" onClick={() => setModal(true)}><Plus size={17}/>Add investment</button></div></header>

        <div className="content">
          <div className="title-row"><div><p className="eyebrow">PORTFOLIO OVERVIEW</p><h1>{view === "Overview" ? "Good evening, Marc." : view}</h1><p>Here’s how your investments are performing.</p></div><div className="as-of"><span className="pulse"/>Market data as of July 13, 2026<button onClick={refresh} aria-label="Refresh prices"><RefreshCw size={15} className={refreshing ? "spin" : ""}/></button></div></div>

          <div className="metric-grid">
            <article className="metric featured"><div className="metric-top"><span>Total portfolio value</span><WalletCards size={18}/></div><strong>{money(total)}</strong><div className="metric-change positive"><ArrowUpRight size={15}/><b>12.8%</b><span>+$6,729.42 all time</span></div><div className="micro-bars">{[30,38,31,47,54,48,65,61,70,83,74,91].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div></article>
            <article className="metric"><div className="metric-top"><span>Today’s change</span><span className="status positive">MARKET OPEN</span></div><strong className="positive">+{money(342.18, 2)}</strong><div className="metric-change positive"><ArrowUpRight size={15}/><b>0.58%</b><span>today</span></div></article>
            <article className="metric"><div className="metric-top"><span>Total gain / loss</span><Sparkles size={18}/></div><strong>+{money(gain)}</strong><div className="metric-change positive"><ArrowUpRight size={15}/><b>{((gain/book)*100).toFixed(1)}%</b><span>since inception</span></div></article>
            <article className="metric"><div className="metric-top"><span>Annualized return</span><SlidersHorizontal size={18}/></div><strong>9.4%</strong><div className="metric-change"><span>vs. benchmark</span><b className="positive">+1.2%</b></div></article>
          </div>

          <div className="dashboard-grid">
            <article className="panel growth-panel"><div className="panel-head"><div><h2>Portfolio growth</h2><p>Market value over time</p></div><div className="ranges">{["1W","1M","3M","6M","1Y","ALL"].map(r=><button key={r} className={range===r?"active":""} onClick={()=>setRange(r)}>{r}</button>)}</div></div><GrowthChart/></article>
            <article className="panel allocation"><div className="panel-head"><div><h2>Asset allocation</h2><p>Current portfolio mix</p></div><button><MoreHorizontal size={18}/></button></div><div className="donut-wrap"><div className="donut"><div><strong>{money(total/1000, 1)}k</strong><span>Total</span></div></div></div><div className="legend">{positions.map((p,i)=>{const v=p.units*p.price;return <div key={p.ticker}><i style={{background:p.color}}/><span>{p.kind === "ETF" ? (i===1?"U.S. equity":"Fixed income") : p.kind === "Stock"?"Canadian equity":"Mutual funds"}</span><b>{((v/total)*100).toFixed(1)}%</b><small>{money(v)}</small></div>})}</div></article>
          </div>

          <div className="performance-row"><article className="performer best"><span className="performer-icon"><ArrowUpRight/></span><div><small>BEST PERFORMER</small><h3>Royal Bank of Canada</h3><p>RY · Canadian equity</p></div><strong>+37.5%</strong><b>+{money(3969)}</b></article><article className="performer worst"><span className="performer-icon"><ArrowDownRight/></span><div><small>NEEDS ATTENTION</small><h3>iShares Core Canadian Bond</h3><p>XBB · Fixed income</p></div><strong>-3.1%</strong><b>-{money(205)}</b></article></div>

          <article className="panel holdings"><div className="panel-head"><div><h2>Your investments</h2><p>{positions.length} holdings across 3 asset classes</p></div><div><button className="secondary"><Download size={15}/>Export</button><button className="secondary"><SlidersHorizontal size={15}/>Filter</button></div></div><div className="table-wrap"><table><thead><tr><th>INVESTMENT</th><th>UNITS</th><th>AVG. PRICE</th><th>CURRENT PRICE</th><th>MARKET VALUE</th><th>GAIN / LOSS</th><th>TODAY</th><th></th></tr></thead><tbody>{positions.map(p=>{const mv=p.units*p.price;const pg=mv-p.units*p.average;return <tr key={p.ticker}><td><span className="ticker" style={{background:p.color}}>{p.ticker.slice(0,2)}</span><span><b>{p.name}</b><small>{p.ticker} · {p.kind}</small></span></td><td>{p.units.toLocaleString("en-CA")}</td><td>{money(p.average,2)}</td><td>{money(p.price,2)}</td><td><b>{money(mv)}</b></td><td className={pg>=0?"positive":"negative"}><b>{pg>=0?"+":""}{money(pg)}</b><small>{pg>=0?"+":""}{((p.price/p.average-1)*100).toFixed(1)}%</small></td><td className={p.day>=0?"positive":"negative"}>{p.day>=0?"+":""}{p.day.toFixed(2)}%</td><td><button><MoreHorizontal size={17}/></button></td></tr>})}</tbody></table></div><button className="view-all">View all investments →</button></article>
          <footer><span><ShieldCheck size={15}/>Read-only tracking · Bank-grade encryption</span><span>Data sources: RBC GAM & market data providers</span></footer>
        </div>
      </section>

      {modal && <div className="modal-backdrop" onMouseDown={()=>setModal(false)}><form className="modal" onSubmit={e=>{e.preventDefault();setModal(false)}} onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Add investment</h2><p>Track a new fund, ETF, or stock.</p></div><button type="button" onClick={()=>setModal(false)}><X/></button></div><label>Ticker or fund code<input autoFocus placeholder="e.g. RBF5380" required/></label><label>Investment name<input placeholder="PH&N U.S. Multi-Style Fund" required/></label><div className="form-grid"><label>Number of units<input type="number" step="any" placeholder="0.00" required/></label><label>Average price<input type="number" step="any" placeholder="$0.00" required/></label></div><label>Currency<select defaultValue="CAD"><option>CAD</option><option>USD</option></select></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setModal(false)}>Cancel</button><button className="add">Add investment</button></div></form></div>}
    </main>
  );
}

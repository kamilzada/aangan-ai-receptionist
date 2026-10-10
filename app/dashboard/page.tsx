import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DASH_COOKIE, tokenValid } from "@/lib/dashboard-auth";
import { hubspotEnabled, listAiCalls, type CallRow } from "@/lib/hubspot";
import { computeMetrics, type Metrics } from "@/lib/metrics";
import { sampleCalls } from "@/lib/sample-data";
import { logout } from "./actions";
import s from "./dashboard.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard · Aangan AI Receptionist" };

const RANGES = [7, 30, 90] as const;

async function loadCalls(now: Date): Promise<{ rows: CallRow[]; source: "hubspot" | "sample"; error?: string }> {
  if (process.env.DASHBOARD_SAMPLE_DATA === "true" || !hubspotEnabled()) return { rows: sampleCalls(now), source: "sample" };
  try {
    const since = new Date(Math.min(now.getTime() - 92 * 86_400_000, Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)));
    return { rows: await listAiCalls(since), source: "hubspot" };
  } catch (err) {
    console.error("[dashboard] HubSpot read failed", err);
    return { rows: [], source: "hubspot", error: "Couldn't reach HubSpot just now. Try refreshing in a minute." };
  }
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  if (!tokenValid((await cookies()).get(DASH_COOKIE)?.value)) redirect("/dashboard/login");

  const { days: rawDays } = await searchParams;
  const days = RANGES.find((r) => String(r) === rawDays) ?? 30;
  const now = new Date();
  const { rows, source, error } = await loadCalls(now);
  const m = computeMetrics(rows, now, days);

  return (
    <main className={s.page}>
      <header className={s.header}>
        <div>
          <p className={s.eyebrow}>Aangan Studio</p>
          <h1 className={s.title}>AI receptionist</h1>
          <p className={s.muted}>Every call the front desk couldn&rsquo;t take, answered and recorded.</p>
        </div>
        <div className={s.headerActions}>
          <nav className={s.tabs} aria-label="Date range">
            {RANGES.map((r) => (
              <a key={r} href={`/dashboard?days=${r}`} className={r === days ? s.tabActive : s.tab} aria-current={r === days ? "page" : undefined}>
                {r} days
              </a>
            ))}
          </nav>
          <form action={logout}>
            <button className={s.linkButton} type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {source === "sample" && (
        <p className={s.notice}>
          Sample data. Real calls will appear here once HubSpot is connected and the first calls come in.
        </p>
      )}
      {error && <p className={s.noticeError}>{error}</p>}

      <section className={s.kpis} aria-label="Headline numbers">
        <Kpi hero label="Calls handled by AI" value={fmtInt(m.calls)} sub={`last ${days} days`} />
        <Kpi label="Meetings booked" value={fmtInt(m.booked)} sub="with a designer" />
        <Kpi label="Booking rate" value={pct(m.bookingRate)} sub={`of ${fmtInt(m.qualifiedLeads)} qualified leads`} />
        <Kpi label="After hours" value={pct(m.afterHoursShare)} sub={`${fmtInt(m.afterHours)} calls outside 10am–7pm`} />
        <Kpi label="Complaints escalated" value={fmtInt(m.complaints)} sub="sent to Nikhil on Telegram" />
      </section>

      <div className={s.grid}>
        <section className={`${s.card} ${s.wide}`} aria-labelledby="trend-h">
          <div className={s.cardHead}>
            <h2 id="trend-h" className={s.cardTitle}>
              Calls per day
            </h2>
            <p className={s.cardSub}>Hover a day for calls and meetings booked</p>
          </div>
          <Trend m={m} />
        </section>

        <section className={`${s.card} ${s.wide}`} aria-labelledby="decline-h">
          <div className={s.cardHead}>
            <h2 id="decline-h" className={s.cardTitle}>
              Why leads were declined
            </h2>
            <p className={s.cardSub}>{fmtInt(sumCounts(m))} declined or deferred</p>
          </div>
          <Declines m={m} />
        </section>

        <section className={`${s.card} ${s.wide}`} aria-labelledby="latest-h">
          <div className={s.cardHead}>
            <h2 id="latest-h" className={s.cardTitle}>
              Latest calls
            </h2>
          </div>
          <Latest rows={m.latest} />
        </section>
      </div>

      <footer className={s.footer}>{source === "sample" ? "Sample data" : "Data from HubSpot"} · times in IST · updated {now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}</footer>
    </main>
  );
}

function Kpi({ label, value, sub, hero }: { label: string; value: string; sub: string; hero?: boolean }) {
  return (
    <div className={hero ? s.kpiHero : s.kpi}>
      <p className={s.kpiLabel}>{label}</p>
      <p className={s.kpiValue}>{value}</p>
      <p className={s.kpiSub}>{sub}</p>
    </div>
  );
}

function Trend({ m }: { m: Metrics }) {
  const max = Math.max(1, ...m.daily.map((d) => d.calls));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const every = Math.ceil(m.daily.length / 6);
  return (
    <figure className={s.trend}>
      <div className={s.trendPlot}>
        <div className={s.trendGrid} aria-hidden>
          {ticks.map((t) => (
            <div key={t} className={s.gridLine} style={{ bottom: `${(t / top) * 100}%` }}>
              <span>{t}</span>
            </div>
          ))}
        </div>
        <div className={s.bars} role="img" aria-label={`Calls per day over the last ${m.daily.length} days, peak ${max}`}>
          {m.daily.map((d) => (
            <div key={d.date} className={s.barSlot} tabIndex={0} data-tip={`${d.label}: ${d.calls} call${d.calls === 1 ? "" : "s"} · ${d.booked} booked`}>
              <div className={s.bar} style={{ height: `${(d.calls / top) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className={s.xAxis} aria-hidden>
        {m.daily.map((d, i) => (
          <span key={d.date}>{i % every === 0 ? d.label : ""}</span>
        ))}
      </div>
      <details className={s.tableToggle}>
        <summary>Show as table</summary>
        <table className={s.miniTable}>
          <thead>
            <tr>
              <th>Day</th>
              <th>Calls</th>
              <th>Booked</th>
            </tr>
          </thead>
          <tbody>
            {[...m.daily].reverse().map((d) => (
              <tr key={d.date}>
                <td>{d.label}</td>
                <td>{d.calls}</td>
                <td>{d.booked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Declines({ m }: { m: Metrics }) {
  if (!m.declines.length) return <p className={s.empty}>No declined leads in this period.</p>;
  const max = Math.max(...m.declines.map((d) => d.count));
  return (
    <ul className={s.hbars}>
      {m.declines.map((d) => (
        <li key={d.reason} data-tip={`${d.label}: ${d.count}`}>
          <span className={s.hbarLabel}>{d.label}</span>
          <span className={s.hbarTrack}>
            <span className={s.hbar} style={{ width: `${(d.count / max) * 100}%` }} />
          </span>
          <span className={s.hbarValue}>{d.count}</span>
        </li>
      ))}
    </ul>
  );
}

const TYPE_LABEL: Record<string, string> = {
  new_lead: "New lead",
  repeat_caller: "Repeat caller",
  complaint: "Complaint",
  dropped: "Dropped",
  other: "Other",
};
const OUTCOME_LABEL: Record<string, string> = {
  booked: "Booked",
  declined: "Declined",
  deferred: "Deferred",
  escalated: "Escalated",
  no_booking: "No booking",
};

function Latest({ rows }: { rows: CallRow[] }) {
  if (!rows.length) return <p className={s.empty}>No calls yet in this period.</p>;
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>When</th>
            <th>Caller</th>
            <th>Type</th>
            <th>Outcome</th>
            <th className={s.num}>Length</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td data-label="When">
                {fmtWhen(r.at)}
                {r.afterHours && <span className={s.tag}>after hours</span>}
              </td>
              <td data-label="Caller">
                <span className={s.caller}>{r.title.split(" · ")[0] || "Unknown"}</span>
                <span className={s.phone}>{maskPhone(r.fromNumber)}</span>
              </td>
              <td data-label="Type">{TYPE_LABEL[r.callType] ?? r.callType}</td>
              <td data-label="Outcome">
                <span className={r.outcome === "booked" ? s.pillBooked : r.outcome === "escalated" ? s.pillAlert : s.pill}>
                  {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                </span>
              </td>
              <td data-label="Length" className={s.num}>
                {Math.floor(r.durationSec / 60)}:{String(r.durationSec % 60).padStart(2, "0")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function niceTicks(max: number): number[] {
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find((st) => max / st <= 4) ?? 100;
  const out = [];
  for (let t = 0; t <= max + step - 1; t += step) out.push(t);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

const sumCounts = (m: Metrics) => m.declines.reduce((a, d) => a + d.count, 0);
const fmtInt = (n: number) => n.toLocaleString("en-IN");
const pct = (x: number) => `${Math.round(x * 100)}%`;
const maskPhone = (p: string) => (p.length > 6 ? `${p.slice(0, 3)} ••••• ${p.slice(-4)}` : p);
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

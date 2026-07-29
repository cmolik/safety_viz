/**
 * Verifies the indicator value-mode math (Month / Float / Fixed) and the
 * historical min/max/avg aggregation, exercising the ACTUAL source functions
 * (Node 24 runs the .ts directly).
 *
 * Three layers:
 *   1. Deterministic cases with hand-computed expected values.
 *   2. An independent recompute of every window, cross-checked against the code.
 *   3. A live cross-check against a running backend — optional; runs only when a
 *      backend URL is given (CLI argument or SAFETY_VIZ_API_URL) and skips
 *      gracefully when unreachable. Layers 1-2 need no backend.
 *
 * Run:  node scripts/verify-calculations.mts  [backend-url]
 */

import { applyValueMode, sourcePeriods, type ValueMode } from "../src/features/indicators/utils/valueMode.ts";
import {
  computeAggregatedMonthStats,
  computeAggregatedMonthStatsExcluding,
} from "../src/features/indicators/utils/chartUtils.ts";
import type { IndicatorOverviewDataPoint } from "../src/features/indicators/api/indicators.ts";

// ----------------------------------------------------------------------------
// Tiny assertion harness
// ----------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const EPS = 1e-9;

function approx(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  if (a === b) return true;
  return Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
}

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    // console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? "  — " + detail : ""}`);
  }
}

function checkVal(name: string, actual: number | null, expected: number | null) {
  check(name, approx(actual, expected), `got ${actual}, expected ${expected}`);
}

// ----------------------------------------------------------------------------
// Fixture builder
// ----------------------------------------------------------------------------
function pt(
  period: string,
  findings: number | null,
  movements: number | null,
  unit: number | null,
): IndicatorOverviewDataPoint {
  // Month-mode value = the month's own ratio (what the endpoint would return).
  const value =
    findings != null && movements != null && movements > 0
      ? (findings / movements) * (unit ?? 1)
      : findings != null && movements == null
        ? findings // findings-only indicators: value is the raw count
        : null;
  return {
    uri: null,
    period,
    periodType: "month",
    value,
    findings,
    movements,
    unit,
    redline: null,
    greenline: null,
  };
}

function byPeriod(data: IndicatorOverviewDataPoint[]) {
  const m = new Map<string, IndicatorOverviewDataPoint>();
  for (const p of data) {
    const [y, mo] = p.period.split("-").map(Number);
    m.set(`${y}-${mo}`, p);
  }
  return m;
}

// ----------------------------------------------------------------------------
// 1. Deterministic, hand-computed cases
// ----------------------------------------------------------------------------
console.log("\n1. Deterministic cases (hand-computed)");

const UNIT = 10000;
const data: IndicatorOverviewDataPoint[] = [];
// 2023: findings = 5 every month, movements = 100
for (let m = 1; m <= 12; m++) data.push(pt(`2023-${m}`, 5, 100, UNIT));
// 2024: findings = month number (1..12), movements = 100
for (let m = 1; m <= 12; m++) data.push(pt(`2024-${m}`, m, 100, UNIT));

const idx = byPeriod;

// -- Month mode is the identity (same reference, values untouched) --
const monthOut = applyValueMode(data, data, "month");
check("month mode returns input reference", monthOut === data);
{
  const p = idx(monthOut).get("2024-3")!;
  checkVal("month 2024-3 value = 3/100*10000", p.value, 300);
}

// -- Fixed = year-to-date (Jan..month) --
const fixedOut = applyValueMode(data, data, "fixed");
{
  const f = idx(fixedOut);
  // 2024-3: sum f = 1+2+3 = 6, sum mv = 300 -> 6/300*10000 = 200
  const p3 = f.get("2024-3")!;
  checkVal("fixed 2024-3 value", p3.value, 200);
  checkVal("fixed 2024-3 Σfindings", p3.findings, 6);
  checkVal("fixed 2024-3 Σmovements", p3.movements, 300);
  checkVal("fixed 2024-3 unit", p3.unit, UNIT);
  // 2024-12: sum f = 78, sum mv = 1200 -> 650
  const p12 = f.get("2024-12")!;
  checkVal("fixed 2024-12 value", p12.value, 650);
  checkVal("fixed 2024-12 Σfindings", p12.findings, 78);
  // 2024-1 (January): window is just itself -> equals month value
  const p1 = f.get("2024-1")!;
  checkVal("fixed 2024-1 (Jan) = month value", p1.value, 100);
}

// -- Float = rolling 12 months ending at the period --
const floatOut = applyValueMode(data, data, "float");
{
  const f = idx(floatOut);
  // 2024-12: window 2024-1..2024-12 == fixed here -> 650
  checkVal("float 2024-12 value", f.get("2024-12")!.value, 650);
  // 2024-3: window 2023-4..2024-3 = (2023-4..12: 9×5=45) + (1+2+3=6) = 51 over 1200 -> 425
  const p3 = f.get("2024-3")!;
  checkVal("float 2024-3 value", p3.value, 425);
  checkVal("float 2024-3 Σfindings", p3.findings, 51);
  checkVal("float 2024-3 Σmovements", p3.movements, 1200);
  // 2023-11: window 2022-12..2023-11 — history starts 2023-1, only 11 present -> incomplete -> null
  checkVal("float 2023-11 incomplete window -> null", f.get("2023-11")!.value, null);
  // 2023-12: window 2023-1..2023-12 = 12 complete -> 5/100*10000 = 500
  checkVal("float 2023-12 first complete window", f.get("2023-12")!.value, 500);
}

// -- Findings-only indicator (no movements): float/fixed cannot average -> null --
const noMv: IndicatorOverviewDataPoint[] = [];
for (let m = 1; m <= 12; m++) noMv.push(pt(`2024-${m}`, m, null, null));
{
  const f = idx(applyValueMode(noMv, noMv, "fixed"));
  checkVal("findings-only fixed 2024-12 -> null", f.get("2024-12")!.value, null);
  const mo = idx(applyValueMode(noMv, noMv, "month"));
  checkVal("findings-only month 2024-6 keeps raw value", mo.get("2024-6")!.value, 6);
}

// -- sourcePeriods window enumeration --
check(
  "sourcePeriods month = self",
  JSON.stringify(sourcePeriods("2024-3", "month")) === JSON.stringify(["2024-3"]),
);
check(
  "sourcePeriods fixed 2024-3 = Jan..Mar",
  JSON.stringify(sourcePeriods("2024-3", "fixed")) === JSON.stringify(["2024-1", "2024-2", "2024-3"]),
);
check(
  "sourcePeriods float 2024-3 = 12 months back",
  JSON.stringify(sourcePeriods("2024-3", "float")) ===
    JSON.stringify(["2023-4", "2023-5", "2023-6", "2023-7", "2023-8", "2023-9", "2023-10", "2023-11", "2023-12", "2024-1", "2024-2", "2024-3"]),
);

// ----------------------------------------------------------------------------
// 2. Independent recompute over a randomized dataset
// ----------------------------------------------------------------------------
console.log("\n2. Independent recompute (randomized, seeded)");

// Deterministic PRNG so the run is reproducible.
let seed = 123456789;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const big: IndicatorOverviewDataPoint[] = [];
for (let y = 2018; y <= 2024; y++) {
  for (let m = 1; m <= 12; m++) {
    // Occasionally drop movements to exercise the null path.
    const hasMv = rnd() > 0.1;
    big.push(pt(`${y}-${m}`, Math.floor(rnd() * 40), hasMv ? Math.floor(rnd() * 900) + 100 : null, 10000));
  }
}

/** Independent reference implementation of one aggregated point. */
function expectedAggregate(period: string, mode: ValueMode, map: Map<string, IndicatorOverviewDataPoint>) {
  const periods = sourcePeriods(period, mode);
  let f = 0, mv = 0, unit: number | null = null, used = 0;
  for (const key of periods) {
    const p = map.get(key);
    if (!p || p.findings == null || p.movements == null) continue;
    f += p.findings;
    mv += p.movements;
    if (p.unit != null) unit = p.unit;
    used++;
  }
  if (used < periods.length || mv <= 0) return null;
  return (f / mv) * (unit ?? 1);
}

for (const mode of ["float", "fixed"] as ValueMode[]) {
  const out = applyValueMode(big, big, mode);
  const map = byPeriod(big);
  let mism = 0;
  for (const p of out) {
    if (p.value == null && byPeriod(big).get(`${p.period.split("-").map(Number).join("-")}`)?.value == null) continue;
    const exp = expectedAggregate(p.period, mode, map);
    if (!approx(p.value, exp)) {
      mism++;
      if (mism <= 3) console.log(`     ${mode} ${p.period}: code=${p.value} ref=${exp}`);
    }
  }
  check(`${mode}: all ${out.length} points match independent recompute`, mism === 0, `${mism} mismatches`);
}

// ----------------------------------------------------------------------------
// 3. Historical min / max / avg aggregation
// ----------------------------------------------------------------------------
console.log("\n3. Historical min/max/avg aggregation");

{
  // June across 3 past years + one current-year value that must be excluded.
  const monthStats = {
    "2021-6": { count: 10 },
    "2022-6": { count: 20 },
    "2023-6": { count: 30 },
    "2024-6": { count: 999 }, // current year — excluded from computeAggregatedMonthStats
    "2022-1": { count: 4 },
  };
  const agg = computeAggregatedMonthStats(monthStats, 2024);
  checkVal("June min over past years", agg["6"]?.min ?? null, 10);
  checkVal("June max over past years", agg["6"]?.max ?? null, 30);
  checkVal("June avg excludes current year", agg["6"]?.avg ?? null, 20);
  check("current-year-only month absent", !("_none" in agg));
  checkVal("single-sample January avg", agg["1"]?.avg ?? null, 4);

  // Excluding-variant keeps current year but drops the named periods.
  const excl = computeAggregatedMonthStatsExcluding(monthStats, new Set(["2023-6"]));
  // Remaining June: 10, 20, 999 -> min 10, max 999, avg (10+20+999)/3
  checkVal("excluding: June min", excl["6"]?.min ?? null, 10);
  checkVal("excluding: June max", excl["6"]?.max ?? null, 999);
  checkVal("excluding: June avg", excl["6"]?.avg ?? null, (10 + 20 + 999) / 3);
}

// ----------------------------------------------------------------------------
// 4. Live cross-check against the backend (optional — only with an explicit URL)
// ----------------------------------------------------------------------------
const rawBase = process.argv[2] || process.env.SAFETY_VIZ_API_URL;
const base = rawBase ? rawBase.replace(/\/+$/, "") + "/" : null;

if (base) console.log(`\n4. Live cross-check against ${base}`);
else console.log("\n4. Live cross-check skipped — pass a backend URL or set SAFETY_VIZ_API_URL to enable it");

function num(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return (await res.json()) as T;
}

async function fetchOverview(uri: string): Promise<IndicatorOverviewDataPoint[]> {
  const q = new URLSearchParams({ uri, startDate: "2016-01-01", endDate: "2032-12-31", roundEndDate: "true" });
  const raw = await getJson<Record<string, unknown>[]>(`root-dashboard/indicators/overview?${q.toString()}`);
  return raw
    .filter((p) => p.period != null)
    .map((p) => ({
      uri: (p.uri as string) ?? null,
      period: String(p.period),
      periodType: (p.periodType as string) ?? null,
      value: num(p, "value"),
      findings: num(p, "findings", "Findings"),
      movements: num(p, "movements", "Movements"),
      unit: num(p, "unit", "Unit"),
      redline: num(p, "redline"),
      greenline: num(p, "greenline"),
    }));
}

if (base) try {
  const meta = await getJson<Array<{ uri: string; id: string; title: string }>>("root-dashboard/indicators");
  check("server returned indicator metadata", Array.isArray(meta) && meta.length > 0, `${meta?.length} indicators`);

  // Find an indicator that actually reports movements (a ratio indicator).
  let ratio: { id: string; data: IndicatorOverviewDataPoint[] } | null = null;
  let anyData: { id: string; data: IndicatorOverviewDataPoint[] } | null = null;
  let scanned = 0;
  for (const m of meta) {
    if (scanned >= 40 || ratio) break;
    scanned++;
    let data: IndicatorOverviewDataPoint[];
    try {
      data = await fetchOverview(m.uri);
    } catch {
      continue;
    }
    if (data.length && !anyData) anyData = { id: m.id, data };
    if (data.some((p) => p.movements != null && p.value != null)) {
      ratio = { id: m.id, data };
    }
  }

  const sample = ratio ?? anyData;
  if (!sample) {
    console.log("  (no indicator returned overview data in the scanned range — skipping live math check)");
  } else {
    console.log(`  using indicator ${sample.id} (${sample.data.length} points, ${ratio ? "ratio/movements" : "findings-only"})`);
    const map = byPeriod(sample.data);
    for (const mode of ["month", "float", "fixed"] as ValueMode[]) {
      const out = applyValueMode(sample.data, sample.data, mode);
      let mism = 0;
      for (const p of out) {
        const raw = map.get(p.period.split("-").map(Number).join("-"));
        if (mode === "month") {
          if (!approx(p.value, raw?.value ?? null)) mism++;
          continue;
        }
        if (raw?.value == null) continue; // untouched months
        const exp = expectedAggregate(p.period, mode, map);
        if (!approx(p.value, exp)) {
          mism++;
          if (mism <= 3) console.log(`     ${mode} ${p.period}: code=${p.value} ref=${exp}`);
        }
      }
      check(`live ${sample.id} ${mode}: ${out.length} points match recompute`, mism === 0, `${mism} mismatches`);
    }

    // Value must equal Σfindings / Σmovements × unit wherever the average exists.
    if (ratio) {
      const f = applyValueMode(sample.data, sample.data, "float");
      let bad = 0;
      for (const p of f) {
        if (p.value == null || p.movements == null || p.movements <= 0) continue;
        if (!approx(p.value, (p.findings! / p.movements) * (p.unit ?? 1))) bad++;
      }
      check(`live ${sample.id} float: value == Σf/Σmv×unit`, bad === 0, `${bad} off`);
    }
  }
} catch (err) {
  console.log(`  (server unreachable / error — skipping live checks: ${(err as Error).message})`);
}

// ----------------------------------------------------------------------------
console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed`);
// Set the exit code and let the loop drain (undici keep-alive sockets are
// unref'd, so they don't hold the process open). Calling process.exit() here
// races socket teardown and triggers a spurious libuv assertion on Windows.
process.exitCode = failed === 0 ? 0 : 1;

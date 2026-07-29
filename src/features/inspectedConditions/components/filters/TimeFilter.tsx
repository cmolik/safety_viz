import { useEffect, useMemo, useState, useCallback } from "react";
import { useDashboardStore, PresetTimeFilter } from "../../store/dashboard.store";
import { formatCZ, parseCZ, today, toIsoLocal, formatISO } from "@lib/date";

export default function TimeFilter() {
  const time = useDashboardStore((s) => s.filters.time);
  const setTimePreset = useDashboardStore((s) => s.setTimePreset);
  const setTimeRange = useDashboardStore((s) => s.setTimeRange);

  const setRangeIfChanged = useCallback((startIso: string, endIso: string) => {
    const cur = useDashboardStore.getState().filters.time;
    if (cur.start === startIso && cur.end === endIso) return;
    setTimeRange(startIso, endIso);
  }, [setTimeRange]);
  
  const [startText, setStartText] = useState<string>("");
  const [endText, setEndText] = useState<string>("");

  useEffect(() => {
    const nextStart = formatCZ(time.start);
    const nextEnd = formatCZ(time.end);
    setStartText((old) => (old !== nextStart ? nextStart : old));
    setEndText((old) => (old !== nextEnd ? nextEnd : old));
  }, [time.start, time.end]);

  const startError = useMemo(() => (startText ? parseCZ(startText) === null : false), [startText]);
  const endError = useMemo(() => (endText ? parseCZ(endText) === null : false), [endText]);

  const commitStart = () => {
    const dt = parseCZ(startText);
    if (dt) {
      setRangeIfChanged(toIsoLocal(dt), time.end ?? "");
      setTimePreset(PresetTimeFilter.Custom);
    }
  };
  const commitEnd = () => {
    const dt = parseCZ(endText);
    if (dt) {
      setRangeIfChanged(time.start ?? "", toIsoLocal(dt));
      setTimePreset(PresetTimeFilter.Custom);
    }
  };

  // Anchor date for the presets: the current "To" value, or today if unset.
  // Parsed from the yyyy-mm-dd form so we build a local-midnight Date (no TZ shift).
  const endAnchor = (): Date => {
    const iso = formatISO(time.end);
    if (iso) {
      const [y, m, d] = iso.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return today();
  };

  // Presets keep the end (To) date and only move the start (From) date back.
  // "Last N days": start = end − N days.
  const setLastDays = (days: number) => {
    const end = endAnchor();
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    setRangeIfChanged(toIsoLocal(start), toIsoLocal(end));
    setTimePreset(PresetTimeFilter.Custom);
  };

  // "1 month": start = first day of the end date's month (month-to-date up to To).
  const setMonthToDate = () => {
    const end = endAnchor();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    setRangeIfChanged(toIsoLocal(start), toIsoLocal(end));
    setTimePreset(PresetTimeFilter.Custom);
  };

  return (
    <div className="block">
      <div className="filterHeader" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Period</div>

      <div className="time-filter" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <label htmlFor="start-date">From</label>
        <input
          id="start-date"
          inputMode="numeric"
          placeholder="dd.mm.rrrr"
          value={startText}
          onChange={(e) => setStartText(e.target.value)}
          onBlur={commitStart}
          onKeyDown={(e) => { if (e.key === "Enter") commitStart(); }}
          style={{
            width: 104,
            padding: "6px 8px",
            border: `1px solid ${startError ? "#ef4444" : "#e5e7eb"}`,
            borderRadius: 8
          }}
        />

        <label htmlFor="end-date">To</label>
        <input
          id="end-date"
          inputMode="numeric"
          placeholder="dd.mm.rrrr"
          value={endText}
          onChange={(e) => setEndText(e.target.value)}
          onBlur={commitEnd}
          onKeyDown={(e) => { if (e.key === "Enter") commitEnd(); }}
          style={{
            width: 104,
            padding: "6px 8px",
            border: `1px solid ${endError ? "#ef4444" : "#e5e7eb"}`,
            borderRadius: 8
          }}
        />

        <button type="button" onClick={() => setLastDays(7)}>7 days</button>
        <button type="button" onClick={() => setLastDays(14)}>14 days</button>
        <button type="button" onClick={setMonthToDate}>1 month</button>
      </div>

      {(startError || endError) && (
        <div style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>
          Invalid date format. Use dd.mm.yyyy (e.g. 1.11.2024).
        </div>
      )}
    </div>
  );
}

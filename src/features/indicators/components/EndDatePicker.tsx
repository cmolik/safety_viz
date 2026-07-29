import { useEffect, useMemo, useState } from "react";
import { MONTH_NAMES_FULL as MONTH_NAMES, lastDayOfMonth, pad2 } from "@lib/period";

type EndDatePickerProps = {
  value: string;
  onChange: (iso: string) => void;
  roundEndDate: boolean;
  onRoundEndDateChange: (round: boolean) => void;
  onSubmit?: () => void; // called when Enter is pressed in a date field
};

const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

type Parsed = {
  year: number | null;
  month: number | null;
  day: number | null;
  isLastOfMonth: boolean;
};

function parseValue(value: string): Parsed {
  if (!value) return { year: null, month: null, day: null, isLastOfMonth: true };
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { year: null, month: null, day: null, isLastOfMonth: true };
  const year = +m[1];
  const month = +m[2];
  const day = +m[3];
  return {
    year,
    month,
    day,
    isLastOfMonth: day === lastDayOfMonth(year, month),
  };
}

export default function EndDatePicker({ value, onChange, roundEndDate, onRoundEndDateChange, onSubmit }: EndDatePickerProps) {
  const parsed = useMemo(() => parseValue(value), [value]);
  const [year, setYear] = useState<string>(parsed.year?.toString() ?? "");
  const [month, setMonth] = useState<string>(parsed.month?.toString() ?? "");
  const [day, setDay] = useState<string>(parsed.day?.toString() ?? "");
  const [fullDate, setFullDate] = useState<boolean>(
    parsed.year !== null && parsed.month !== null && parsed.day !== null && !parsed.isLastOfMonth
  );

  useEffect(() => {
    const p = parseValue(value);
    setYear(p.year?.toString() ?? "");
    setMonth(p.month?.toString() ?? "");
    setDay(p.day?.toString() ?? "");
    if (p.year !== null && p.month !== null && p.day !== null && !p.isLastOfMonth) {
      setFullDate(true);
    }
  }, [value]);

  const emit = (y: string, mo: string, d: string, full: boolean) => {
    const yi = parseInt(y, 10);
    const mi = parseInt(mo, 10);
    if (isNaN(yi) || isNaN(mi) || yi < MIN_YEAR || yi > MAX_YEAR || mi < 1 || mi > 12) {
      // Incomplete/invalid input (e.g. a cleared field) — keep the last committed
      // date rather than wiping it; the user can finish typing a new value.
      return;
    }
    const maxDay = lastDayOfMonth(yi, mi);
    let di: number;
    if (full) {
      const parsedDay = parseInt(d, 10);
      if (isNaN(parsedDay) || parsedDay < 1 || parsedDay > maxDay) {
        // Incomplete/invalid day — keep the last committed date.
        return;
      }
      di = parsedDay;
    } else {
      di = maxDay;
    }
    const next = `${yi.toString().padStart(4, "0")}-${pad2(mi)}-${pad2(di)}`;
    if (next !== value) onChange(next);
  };

  const handleMonthChange = (v: string) => {
    setMonth(v);
    if (fullDate && day) {
      const yi = parseInt(year, 10);
      const mi = parseInt(v, 10);
      if (!isNaN(yi) && !isNaN(mi)) {
        const maxDay = lastDayOfMonth(yi, mi);
        const parsedDay = parseInt(day, 10);
        if (!isNaN(parsedDay) && parsedDay > maxDay) {
          const clamped = maxDay.toString();
          setDay(clamped);
          emit(year, v, clamped, fullDate);
          return;
        }
      }
    }
    emit(year, v, day, fullDate);
  };

  const handleYearChange = (v: string) => {
    setYear(v);
    if (fullDate && day) {
      const yi = parseInt(v, 10);
      const mi = parseInt(month, 10);
      if (!isNaN(yi) && !isNaN(mi)) {
        const maxDay = lastDayOfMonth(yi, mi);
        const parsedDay = parseInt(day, 10);
        if (!isNaN(parsedDay) && parsedDay > maxDay) {
          const clamped = maxDay.toString();
          setDay(clamped);
          emit(v, month, clamped, fullDate);
          return;
        }
      }
    }
    emit(v, month, day, fullDate);
  };

  const handleDayChange = (v: string) => {
    setDay(v);
    emit(year, month, v, fullDate);
  };

  const handleFullDateToggle = (checked: boolean) => {
    setFullDate(checked);
    if (checked) {
      // Use last-of-month as the starting day when enabling.
      const yi = parseInt(year, 10);
      const mi = parseInt(month, 10);
      const seed = !isNaN(yi) && !isNaN(mi) ? lastDayOfMonth(yi, mi).toString() : day || "";
      setDay(seed);
      emit(year, month, seed, true);
    } else {
      // Rounding to end-of-month only applies to a specific-day end date.
      onRoundEndDateChange(false);
      emit(year, month, day, false);
    }
  };

  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  const monthValid = !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12;
  const yearValid = !isNaN(yearNum) && yearNum >= MIN_YEAR && yearNum <= MAX_YEAR;
  const maxDay = monthValid && yearValid ? lastDayOfMonth(yearNum, monthNum) : 31;
  const dayNum = parseInt(day, 10);
  const dayValid = !fullDate || (!isNaN(dayNum) && dayNum >= 1 && dayNum <= maxDay);

  const fieldHeight = 32;
  const monthInputStyle: React.CSSProperties = {
    padding: "6px 8px",
    border: `1px solid ${month && !monthValid ? "#ef4444" : "#d1d5db"}`,
    borderRadius: 4,
    fontSize: 14,
    flex: 1,
    minWidth: 0,
    height: fieldHeight,
    boxSizing: "border-box",
  };
  const yearInputStyle: React.CSSProperties = {
    padding: "6px 8px",
    border: `1px solid ${year && !yearValid ? "#ef4444" : "#d1d5db"}`,
    borderRadius: 4,
    fontSize: 14,
    width: 90,
    height: fieldHeight,
    boxSizing: "border-box",
  };
  const dayInputStyle: React.CSSProperties = {
    padding: "6px 8px",
    border: `1px solid ${day && !dayValid ? "#ef4444" : "#d1d5db"}`,
    borderRadius: 4,
    fontSize: 14,
    width: 60,
    height: fieldHeight,
    boxSizing: "border-box",
  };
  const dayTextStyle: React.CSSProperties = {
    width: 60,
    height: fieldHeight,
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    color: monthValid && yearValid ? "#1f2937" : "#9ca3af",
    fontVariantNumeric: "tabular-nums",
    userSelect: "none",
  };
  const dotStyle: React.CSSProperties = {
    fontSize: 16,
    color: "#6b7280",
    userSelect: "none",
  };

  const dayDisplay = monthValid && yearValid ? maxDay.toString() : "—";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSubmit?.();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {fullDate ? (
          <input
            type="number"
            aria-label="Day"
            placeholder="DD"
            min={1}
            max={maxDay}
            value={day}
            onChange={(e) => handleDayChange(e.target.value)}
            onKeyDown={handleKeyDown}
            style={dayInputStyle}
          />
        ) : (
          <span style={dayTextStyle} aria-label="Day">{dayDisplay}</span>
        )}
        <span style={dotStyle}>.</span>
        <select
          aria-label="Month"
          value={month}
          onChange={(e) => handleMonthChange(e.target.value)}
          style={monthInputStyle}
        >
          <option value="">Month…</option>
          {MONTH_NAMES.map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>
        <span style={dotStyle}>.</span>
        <input
          type="number"
          aria-label="Year"
          placeholder="YYYY"
          min={MIN_YEAR}
          max={MAX_YEAR}
          value={year}
          onChange={(e) => handleYearChange(e.target.value)}
          onKeyDown={handleKeyDown}
          style={yearInputStyle}
        />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151" }}>
        <input
          type="checkbox"
          checked={fullDate}
          onChange={(e) => handleFullDateToggle(e.target.checked)}
        />
        Specific day
      </label>

      {fullDate && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", marginLeft: 20 }}>
          <input
            type="checkbox"
            checked={roundEndDate}
            onChange={(e) => onRoundEndDateChange(e.target.checked)}
          />
          Round up to end of month
        </label>
      )}
    </div>
  );
}

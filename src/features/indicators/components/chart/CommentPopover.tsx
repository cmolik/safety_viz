import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IndicatorComment, NewIndicatorComment, IndicatorCommentUpdate } from "../../api/comments";
import { COMMENT_TYPES } from "../../api/comments";
import { commentTypeLabel, formatCommentDate, commentDotColor } from "../../utils/comments";
import { MONTH_NAMES_FULL as MONTH_NAMES, isoMonthStart, isoMonthEnd } from "@lib/period";

/** The (year, month) cell the popover edits, plus where it was opened from. */
export type CommentAnchor = {
  year: number;
  month: number;    // 1-12
  x: number;        // viewport coords of the clicked marker
  y: number;
};

type Props = {
  anchor: CommentAnchor;
  indicatorUri: string;
  indicatorTitle: string;
  // The comments of this exact (year, month) cell, date-sorted.
  comments: IndicatorComment[];
  onSave: (input: NewIndicatorComment | IndicatorCommentUpdate) => Promise<boolean>;
  onDelete: (uri: string) => Promise<boolean>;
  onClose: () => void;
};

const WIDTH = 340;
const MARGIN = 8; // keep the box this far from the viewport edges

/**
 * Per-month comment editor, anchored at the marker that opened it. Lists the
 * month's comments and edits them in place; a row is either read-only, an edit
 * form, or a delete confirmation.
 */
export default function CommentPopover({
  anchor, indicatorUri, indicatorTitle, comments, onSave, onDelete, onClose,
}: Props) {
  // Which row is in which mode: the uri being edited, "new" while adding, or
  // the uri awaiting delete confirmation.
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Escape closes — but only when no row is open, so it can first cancel a form.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editing) setEditing(null);
      else if (confirmingDelete) setConfirmingDelete(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, confirmingDelete, onClose]);

  // Keep the box inside the viewport: flip it left / upward near the edges.
  const left = Math.min(anchor.x + 12, window.innerWidth - WIDTH - MARGIN);
  const maxHeight = window.innerHeight - anchor.y - 24 - MARGIN;
  const flipUp = maxHeight < 220;

  // The editor is scoped to one (year, month) cell, so the date stays inside it:
  // a date from another month would move the comment out of the cell that is
  // open — and out of the loaded range entirely, where it would just vanish.
  const minDate = isoMonthStart(anchor.year, anchor.month);
  const maxDate = isoMonthEnd(anchor.year, anchor.month);

  const submit = async (input: NewIndicatorComment | IndicatorCommentUpdate) => {
    setBusy(true);
    const ok = await onSave(input);
    setBusy(false);
    if (ok) setEditing(null);
  };

  const remove = async (uri: string) => {
    setBusy(true);
    const ok = await onDelete(uri);
    setBusy(false);
    if (ok) setConfirmingDelete(null);
  };

  return createPortal(
    <>
      {/* Backdrop — any outside click closes the popover. */}
      <div
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        style={{ position: "fixed", inset: 0, zIndex: 3000 }}
      />
      <div
        style={{
          position: "fixed",
          left: Math.max(MARGIN, left),
          ...(flipUp
            ? { bottom: Math.max(MARGIN, window.innerHeight - anchor.y + 12) }
            : { top: anchor.y + 12 }),
          zIndex: 3001,
          width: WIDTH,
          maxHeight: flipUp ? anchor.y - 24 : maxHeight,
          overflowY: "auto",
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
          fontSize: 13,
          color: "#1f2937",
        }}
      >
        {/* Header — which cell of which indicator is being edited. */}
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid #f3f4f6",
          position: "sticky",
          top: 0,
          background: "white",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>
              {MONTH_NAMES[anchor.month - 1]} {anchor.year}
            </div>
            <div style={{
              fontSize: 11,
              color: "#6b7280",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {indicatorTitle}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none", background: "transparent", cursor: "pointer",
              fontSize: 16, lineHeight: 1, color: "#9ca3af", padding: 2,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "4px 12px 10px" }}>
          {comments.length === 0 && editing !== "new" && (
            <div style={{ padding: "10px 0", color: "#6b7280", fontSize: 12 }}>
              No comments for this month.
            </div>
          )}

          {comments.map((c) => (
            <div key={c.uri} style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
              {editing === c.uri ? (
                <CommentForm
                  busy={busy}
                  initial={c}
                  defaultDate={c.date}
                  minDate={minDate}
                  maxDate={maxDate}
                  onCancel={() => setEditing(null)}
                  onSubmit={(values) => submit({ ...values, uri: c.uri, indicator: indicatorUri })}
                />
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>{formatCommentDate(c.date)}</span>
                    {c.commentType && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        // Dark text, not white: the explanation colour is a light
                        // green that white would disappear into.
                        color: "#1f2937",
                        background: commentDotColor([c]),
                        borderRadius: 999,
                        padding: "1px 6px",
                      }}>
                        {commentTypeLabel(c.commentType)}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    {confirmingDelete !== c.uri && (
                      <>
                        <RowButton onClick={() => { setConfirmingDelete(null); setEditing(c.uri); }}>Edit</RowButton>
                        <RowButton onClick={() => { setEditing(null); setConfirmingDelete(c.uri); }}>Delete</RowButton>
                      </>
                    )}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{c.comment}</div>
                  {confirmingDelete === c.uri && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 12, color: "#b91c1c" }}>Delete this comment?</span>
                      <span style={{ flex: 1 }} />
                      <RowButton onClick={() => remove(c.uri)} disabled={busy} danger>Yes, delete</RowButton>
                      <RowButton onClick={() => setConfirmingDelete(null)} disabled={busy}>Cancel</RowButton>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {editing === "new" ? (
            <div style={{ padding: "8px 0" }}>
              <CommentForm
                busy={busy}
                defaultDate={minDate}
                minDate={minDate}
                maxDate={maxDate}
                onCancel={() => setEditing(null)}
                onSubmit={(values) => submit({ ...values, indicator: indicatorUri })}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setConfirmingDelete(null); setEditing("new"); }}
              style={{
                marginTop: 8,
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "1px dashed #d1d5db",
                borderRadius: 6,
                padding: "7px 10px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: "#374151",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f9fafb"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              + Add comment
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

/** Small text button used for the per-row actions. */
function RowButton({
  children, onClick, disabled, danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "none",
        background: "transparent",
        cursor: disabled ? "default" : "pointer",
        fontSize: 11,
        fontWeight: 600,
        color: disabled ? "#9ca3af" : danger ? "#b91c1c" : "#2563eb",
        padding: "1px 3px",
      }}
    >
      {children}
    </button>
  );
}

type FormValues = { date: string; comment: string; commentType: string | null };

/**
 * Add / edit form. `defaultDate` is the comment's own date when editing and the
 * 1st of the month when adding — the chart resolves to months, but the API
 * stores a day, so the exact date stays editable.
 */
function CommentForm({
  initial, defaultDate, minDate, maxDate, busy, onSubmit, onCancel,
}: {
  initial?: IndicatorComment;
  defaultDate: string;
  minDate: string;
  maxDate: string;
  busy: boolean;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [text, setText] = useState(initial?.comment ?? "");
  const [type, setType] = useState<string>(initial?.commentType ?? COMMENT_TYPES[0]);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textRef.current?.focus(); }, []);

  // A typed-in date can still fall outside the range the picker offers, so the
  // bounds are enforced here too rather than only on the input.
  const inMonth = date >= minDate && date <= maxDate;
  const canSave = text.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && inMonth && !busy;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="date"
          value={date}
          min={minDate}
          max={maxDate}
          onChange={(e) => setDate(e.target.value)}
          title="The comment's day within this month"
          style={{
            ...fieldStyle,
            flex: "0 0 auto",
            borderColor: inMonth ? "#d1d5db" : "#dc2626",
          }}
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{ ...fieldStyle, flex: 1 }}
        >
          {/* An unknown type coming from the API stays selectable so editing
              another field can't silently rewrite it. */}
          {!COMMENT_TYPES.includes(type as (typeof COMMENT_TYPES)[number]) && (
            <option value={type}>{commentTypeLabel(type)}</option>
          )}
          {COMMENT_TYPES.map((t) => (
            <option key={t} value={t}>{commentTypeLabel(t)}</option>
          ))}
        </select>
      </div>
      <textarea
        ref={textRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Comment text"
        style={{ ...fieldStyle, resize: "vertical", fontFamily: "inherit" }}
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} disabled={busy} style={secondaryButtonStyle}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit({ date, comment: text.trim(), commentType: type || null })}
          disabled={!canSave}
          style={{
            ...primaryButtonStyle,
            opacity: canSave ? 1 : 0.5,
            cursor: canSave ? "pointer" : "default",
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: "5px 7px",
  fontSize: 12,
  color: "#1f2937",
  background: "white",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "white",
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  cursor: "pointer",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "1px solid #2563eb",
  background: "#2563eb",
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 600,
  color: "white",
};

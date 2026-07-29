import { ApiClient } from "@core/api/http";

/**
 * Indicator comments — free-text notes attached to an indicator at a specific
 * date, served by /root-dashboard/comments.
 *
 * This endpoint replaces the older /root-dashboard/indicators/countermeasure
 * one: a countermeasure is now a comment with `commentType: "mitigation"`.
 * Unlike that endpoint, /root-dashboard/comments has NO indicator filter — it
 * returns every comment in the requested date range, so callers filter by
 * `indicator` client-side (see `commentsByPeriod`).
 */

/**
 * Known comment types. The backend stores free text, so the type is widened to
 * `string`; use `COMMENT_TYPES` for the values the UI offers.
 */
export type CommentType = "explanation" | "mitigation";
export const COMMENT_TYPES: CommentType[] = ["explanation", "mitigation"];

/** A comment as returned by the API. */
export type IndicatorComment = {
  uri: string;                    // comment id — required for PUT / DELETE
  indicator: string;              // URI of the indicator the comment belongs to
  date: string;                   // "YYYY-MM-DD" — the period the comment is about
  creationDate: string | null;    // server-managed (ISO instant)
  lastUpdatedOn: string | null;   // server-managed (ISO instant)
  comment: string;                // the free text
  commentType: string | null;     // e.g. "explanation", "mitigation"
};

/** Fields the server accepts on POST; `creationDate`/`lastUpdatedOn` are ignored. */
export type NewIndicatorComment = {
  indicator: string;
  date: string;                   // "YYYY-MM-DD"
  comment: string;
  commentType?: string | null;
};

/** Fields the server accepts on PUT. `uri` selects the comment; every other
 *  field is written as sent, so unchanged values must be resent to be kept. */
export type IndicatorCommentUpdate = NewIndicatorComment & { uri: string };

export type CommentsQueryParams = {
  startDate?: string;   // "YYYY-MM-DD"
  endDate?: string;     // "YYYY-MM-DD"
};

const COMMENTS_PATH = "root-dashboard/comments";

function buildQuery(params: CommentsQueryParams): string {
  const q = new URLSearchParams();
  if (params.startDate) q.append("startDate", params.startDate);
  if (params.endDate) q.append("endDate", params.endDate);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Drops malformed rows and defaults the nullable fields, so consumers can
 *  trust `uri` / `indicator` / `date` / `comment` to be non-empty strings. */
function normalizeComment(raw: unknown): IndicatorComment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const uri = typeof r.uri === "string" ? r.uri : "";
  const indicator = typeof r.indicator === "string" ? r.indicator : "";
  const date = typeof r.date === "string" ? r.date : "";
  const comment = typeof r.comment === "string" ? r.comment : "";
  if (!indicator || !date || !comment) return null;
  return {
    uri,
    indicator,
    date,
    creationDate: typeof r.creationDate === "string" ? r.creationDate : null,
    lastUpdatedOn: typeof r.lastUpdatedOn === "string" ? r.lastUpdatedOn : null,
    comment,
    commentType: typeof r.commentType === "string" && r.commentType ? r.commentType : null,
  };
}

/**
 * GET all comments in a date range (across all indicators).
 */
export async function fetchComments(
  api: ApiClient,
  params: CommentsQueryParams = {},
  signal?: AbortSignal
): Promise<IndicatorComment[]> {
  const raw = await api.get<unknown[]>(
    `${COMMENTS_PATH}${buildQuery(params)}`,
    signal ? { signal } : undefined
  );
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeComment).filter((c): c is IndicatorComment => c !== null);
}

/**
 * POST a new comment. The server assigns `uri` and the creation timestamps and
 * answers 204 with no body — so the new comment's `uri` is only obtainable by
 * re-reading the range (see the store's `saveComment`).
 */
export async function createComment(
  api: ApiClient,
  input: NewIndicatorComment
): Promise<void> {
  await api.post<void>(COMMENTS_PATH, {
    indicator: input.indicator,
    date: input.date,
    comment: input.comment,
    ...(input.commentType ? { commentType: input.commentType } : {}),
  });
}

/**
 * PUT an existing comment. Only `indicator`, `date`, `comment` and
 * `commentType` are considered — so the caller must send the current values of
 * the fields it does not intend to change. Answers 204 with no body.
 */
export async function updateComment(
  api: ApiClient,
  input: IndicatorCommentUpdate
): Promise<void> {
  await api.put<void>(COMMENTS_PATH, {
    uri: input.uri,
    indicator: input.indicator,
    date: input.date,
    comment: input.comment,
    commentType: input.commentType ?? null,
  });
}

/**
 * DELETE a comment by its `uri`.
 */
export async function deleteComment(api: ApiClient, uri: string): Promise<void> {
  const q = new URLSearchParams({ uri });
  await api.del<void>(`${COMMENTS_PATH}?${q.toString()}`);
}

/** ===== Mapping helpers (comment date -> chart period) ===== */

/**
 * The chart keys periods as "YYYY-M" with the month NOT zero-padded, matching
 * the overview endpoint's `period`. A comment carries a full date, so its
 * period is simply its year-month.
 */
export function commentPeriodKey(date: string): string | null {
  const m = date.match(/^(\d{4})-(\d{1,2})/);
  if (!m) return null;
  return `${parseInt(m[1], 10)}-${parseInt(m[2], 10)}`;
}

/**
 * Splits a range response into per-indicator buckets, each sorted by date.
 * The endpoint returns every indicator's comments at once, so this is how one
 * fetch is shared by all of them (see the store's `comments`).
 */
export function commentsByIndicator(
  comments: IndicatorComment[]
): Record<string, IndicatorComment[]> {
  const byIndicator: Record<string, IndicatorComment[]> = {};
  for (const c of comments) {
    const bucket = byIndicator[c.indicator];
    if (bucket) bucket.push(c);
    else byIndicator[c.indicator] = [c];
  }
  for (const bucket of Object.values(byIndicator)) {
    bucket.sort((a, b) => a.date.localeCompare(b.date));
  }
  return byIndicator;
}

/**
 * Groups one indicator's comments by chart period ("YYYY-M"). A period can hold
 * several comments (different days or types), so values are arrays; input order
 * is preserved, so pass a date-sorted list to have the tooltip read
 * chronologically.
 */
export function commentsByPeriod(
  comments: IndicatorComment[]
): Map<string, IndicatorComment[]> {
  const byPeriod = new Map<string, IndicatorComment[]>();
  for (const c of comments) {
    const key = commentPeriodKey(c.date);
    if (!key) continue;
    const bucket = byPeriod.get(key);
    if (bucket) bucket.push(c);
    else byPeriod.set(key, [c]);
  }
  return byPeriod;
}

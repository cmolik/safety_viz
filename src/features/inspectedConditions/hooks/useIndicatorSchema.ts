import { useEffect, useState } from "react";
import {
  fetchIndicatorSchemas,
  schemaForIndicator,
  type IndicatorSchema,
} from "../api/schemas";

export type IndicatorSchemaState = {
  /** Schema resolved for the current indicator URI (null until loaded / if none). */
  schema: IndicatorSchema | null;
  /** All loaded schemas (null until loaded). */
  all: IndicatorSchema[] | null;
  loading: boolean;
  error: unknown;
};

/**
 * Loads the indicator schema catalog and resolves the schema for `indicatorUri`.
 * The catalog fetch is cached in the resource layer, so mounting this in several
 * components triggers a single load.
 */
export function useIndicatorSchema(indicatorUri: string | null | undefined): IndicatorSchemaState {
  const [all, setAll] = useState<IndicatorSchema[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchIndicatorSchemas()
      .then((schemas) => {
        if (cancelled) return;
        setAll(schemas);
        setError(undefined);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    all,
    schema: all ? schemaForIndicator(all, indicatorUri) : null,
    loading,
    error,
  };
}

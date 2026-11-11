import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

/** Calls an admin lead-finding function and turns failures into readable messages. */
export async function callFn<T = any>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) { try { const j = await error.context.json(); msg = typeof j.error === "string" ? j.error : JSON.stringify(j.error); } catch { /* keep */ } }
    if (/Google Places 403/.test(msg)) msg = "Google refused the search. In Google Cloud, enable \"Places API (New)\" for this key and allow it in the key's API restrictions.";
    throw new Error(msg);
  }
  return data as T;
}

/** Very small CSV reader (handles quoted cells). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some((x) => x.trim())) rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

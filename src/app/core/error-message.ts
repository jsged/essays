/**
 * Normalize any thrown value into a user-facing string.
 *
 * Supabase's `PostgrestError` (returned from `.from(...).select/...`) and
 * `AuthError` (auth-related rejections) are plain objects with shape:
 *   { message: string; code?: string; details?: ...; hint?: ... }
 * They are NOT `Error` instances, so `err instanceof Error` is false
 * and a naive `String(err)` evaluates to `"[object Object]"`, which is
 * what was showing up in the dashboard / new-screen error banners when
 * the placeholder Supabase URL was unreachable.
 *
 * This helper pulls `.message` regardless of the error family, falls
 * back to `.msg` (some auth responses), then to `error_description`
 * (Supabase GoTrue auth), and finally JSON.stringifies anything else
 * we can't recognize so it never silently becomes the string
 * `"[object Object]"`.
 */
export function errorMessage(err: unknown): string {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const o = err as {
      message?: unknown;
      msg?: unknown;
      error_description?: unknown;
      error?: { message?: unknown };
    };
    if (typeof o.message === 'string' && o.message.length > 0) {
      return o.message;
    }
    if (typeof o.msg === 'string' && o.msg.length > 0) {
      return o.msg;
    }
    if (typeof o.error_description === 'string' && o.error_description.length > 0) {
      return o.error_description;
    }
    if (o.error && typeof o.error.message === 'string' && o.error.message.length > 0) {
      return o.error.message;
    }
    try {
      // Postgres-shaped errors can be verbose; cap to 480 so the banner
      // stays scannable while still preserving `.message` and a couple of
      // structured fields.
      return JSON.stringify(err).slice(0, 480);
    } catch {
      return 'Unserializable error';
    }
  }
  return String(err);
}

// Domain model for an essay.
// Shape mirrors the `essays` table defined in dev/PLAN.md §4.
//
// Insert contract: the Angular code NEVER sends `user_id` in an INSERT.
// Enforced at two layers:
//   1. Type: `EssayInsert` is `Pick<Essay, 'question'> & { status? }` so the
//      type system refuses a `user_id` field at compile time.
//   2. Schema: the `essays.user_id` column has `default auth.uid()` (see
//      supabase/schema.sql), so the DB stamps it from the caller's session.
// The RLS WITH CHECK policy is the actual security boundary — it would
// still catch a hostile client that bypassed the type system and sent
// `user_id` explicitly. Do not extend `EssayInsert` to include `user_id`.

export type EssayStatus = 'draft' | 'finished';

export interface Essay {
  id: string;
  user_id: string;
  question: string;
  answer_html: string | null;
  answer_json: unknown | null;
  status: EssayStatus;
  word_count: number | null;
  page_count: number | null;
  created_at: string;
  updated_at: string;
}

export type EssayInsert = Pick<Essay, 'question'> & {
  status?: EssayStatus;
};

export type EssayUpdate = Partial<
  Pick<Essay, 'question' | 'answer_html' | 'answer_json' | 'status'>
>;

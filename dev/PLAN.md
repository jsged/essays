# Essay App — Plan

> A web app where I can write down essay questions, draft the answers in a rich text
> editor, mark them finished, and then browse the full archive online from any device.

## 1. Goals

- **Capture a question** in seconds (so I'm not bottlenecked by the blank page).
- **Write a long-form answer** in a clean rich text editor with autosave.
- **Mark it finished** when it's done — locking edits unless I reopen it.
- **Browse the archive** later, on any device, with search/filter to find old answers.

Non-goals (v1):

- Multi-device real-time collaborative editing.
- AI assistance / grading / feedback.
- Public sharing URLs.

## 2. Requirements (confirmed)

| Area        | Choice                                  |
| ----------- | --------------------------------------- |
| Frontend    | **Angular** (standalone, modern, v17+)  |
| Auth        | **Multi-user with login** (Supabase)    |
| Editor      | **Rich text** (CKEditor 5 for Angular) |
| Backend/DB  | **Supabase** (Postgres + Auth + Storage)|
| App location| `./` (project root) — not under `dev/`  |

Note on the editor swap: **TipTap** is React-first, so for Angular we'll use
**CKEditor 5** via the official `@ckeditor/ckeditor5-angular` wrapper. `ngx-quill`
is a lighter alternative if we decide CKEditor is overkill.

## 3. High-level architecture

```
┌─────────────────────────────┐         ┌─────────────────────────┐
│  Angular SPA  (./, dist/)   │  HTTPS  │  Supabase project        │
│                             │ ──────▶ │  - Postgres (essays)     │
│  @supabase/supabase-js      │         │  - Auth (email + OAuth)  │
│  Direct DB calls (RLS)      │         │  - Row Level Security    │
└─────────────────────────────┘         └─────────────────────────┘
```

- **No custom backend.** The SPA talks to Supabase directly. RLS makes this safe —
  each user only sees/modifies their own rows.
- **Deploy**: any static host (Vercel / Netlify / Firebase Hosting / Cloudflare Pages).
  Supabase handles DB, auth, and storage.

## 4. Data model

Supabase Postgres — one table to start, easy to extend.

```sql
create table essays (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  question    text not null,
  answer_html text,                              -- rendered/sanitized HTML
  answer_json jsonb,                             -- CKEditor structured doc
  status      text not null default 'draft'
                check (status in ('draft', 'finished')),
  word_count  integer generated always as
                (coalesce(array_length(regexp_split_to_array(
                  strip_html(coalesce(answer_html, '')), '\s+'), 1), 0)) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index essays_user_updated_idx on essays (user_id, updated_at desc);

alter table essays enable row level security;

create policy "own rows select" on essays
  for select using (auth.uid() = user_id);
create policy "own rows insert" on essays
  for insert with check (auth.uid() = user_id);
create policy "own rows update" on essays
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows delete" on essays
  for delete using (auth.uid() = user_id);

-- auto-touch updated_at
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
create trigger essays_touch_updated_at
  before update on essays
  for each row execute function touch_updated_at();
```

The `strip_html` helper can be added inline or replaced by computing word count
client-side at save time (simpler — we'd then drop the generated column).

## 5. Page-by-page UX

### 5.1 Routes

| Path              | Component             | Auth? | Purpose                            |
| ----------------- | --------------------- | ----- | ---------------------------------- |
| `/login`          | `LoginComponent`      | No    | Email/password login               |
| `/signup`         | `SignupComponent`     | No    | Email/password signup              |
| `/app`            | `EssayListComponent`  | Yes   | Dashboard, all of the user's essays|
| `/app/new`        | `EssayNewComponent`   | Yes   | Enter question → create + redirect |
| `/app/edit/:id`   | `EssayEditComponent`  | Yes   | Rich text editor + autosave        |
| `/app/view/:id`   | `EssayViewComponent`  | Yes   | Read-only rendered answer + actions|

A `CanMatchFn` auth guard protects everything under `/app`.

### 5.2 Flows

1. **Sign up** → email + password → Supabase creates user → redirect to `/app`.
2. **New essay** → textarea for the question → "Create" → inserts row with
   `status='draft'`, `answer_html=null` → redirect to `/app/edit/:id`.
3. **Edit** → CKEditor populated with `answer_json` (falls back to `answer_html`)
   → on change, debounce 1.5s, autosave → buttons: **Save** (manual), **Mark
   finished** (sets status, locks the editor), **Reopen** (only when finished).
4. **View** → renders sanitized `answer_html` → toolbar: **Edit**, **Delete**
   (confirm modal), **Export** (`.html` / `.md` download).
5. **List / dashboard** → cards grouped by `status` (Drafts / Finished), each
   card shows question snippet, word count, last edited relative time, status
   pill. Filters: search (question text), status, sort by updated/created/word
   count.

### 5.3 Empty / loading / error states

- Loading: skeleton cards on list, spinner in editor save pill.
- Empty: friendly "No essays yet — write your first one" CTA on dashboard.
- Errors: inline banner above the affected component, never a raw error.

## 6. Project layout (when we build)

The Angular app lives in the repository **root** — this `PLAN.md` is the only
thing initially under `./dev/`.

```
.
├── README.md                # dev notes, set-up, deploy
├── PLAN.md                  # ← this file (in ./dev/)
├── angular.json             # generated by `ng new`
├── package.json
├── tsconfig*.json
├── src/
│   ├── main.ts
│   ├── index.html
│   ├── styles.scss
│   ├── environments/
│   │   ├── environment.ts          # SUPABASE_URL, SUPABASE_ANON_KEY
│   │   └── environment.prod.ts
│   └── app/
│       ├── app.config.ts           # provideRouter, provideHttpClient
│       ├── app.routes.ts
│       ├── app.component.ts        # layout shell, top nav, auth indicator
│       ├── core/
│       │   ├── supabase.service.ts # client singleton + typed tables
│       │   ├── auth.service.ts     # signup, login, logout, user signal
│       │   ├── auth.guard.ts       # CanMatchFn
│       │   └── essays.service.ts   # CRUD: list/get/create/update/delete
│       ├── features/
│       │   ├── auth/
│       │   │   ├── login.component.ts
│       │   │   └── signup.component.ts
│       │   └── essays/
│       │       ├── list/essay-list.component.ts
│       │       ├── new/essay-new.component.ts
│       │       ├── edit/essay-edit.component.ts
│       │       └── view/essay-view.component.ts
│       └── shared/
│           ├── editor/ck-editor.component.ts
│           ├── ui/                 # buttons, cards, pills, modal
│           └── pipes/safe-html.pipe.ts   # DOMPurify + DomSanitizer
```

## 7. Key code sketches

### `supabase.service.ts`

```ts
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
  );
}
```

### `auth.service.ts`

```ts
@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService).client;
  user = signal<User | null>(null);

  constructor() {
    this.supabase.auth.getUser().then(({ data }) => this.user.set(data.user));
    this.supabase.auth.onAuthStateChange((_e, sess) =>
      this.user.set(sess?.user ?? null),
    );
  }
  signUp(email: string, password: string) { /* ... */ }
  signIn(email: string, password: string) { /* ... */ }
  signOut() { return this.supabase.auth.signOut(); }
}
```

### `essays.service.ts`

```ts
@Injectable({ providedIn: 'root' })
export class EssaysService {
  private supabase = inject(SupabaseService).client;
  private table = () => this.supabase.from('essays');

  list()        { return this.table().select('*').order('updated_at', { ascending: false }); }
  get(id: string){ return this.table().select('*').eq('id', id).single(); }
  create(question: string) {
    return this.table().insert({ question, status: 'draft' }).select().single();
  }
  update(id: string, patch: Partial<Essay>) { return this.table().update(patch).eq('id', id); }
  remove(id: string) { return this.table().delete().eq('id', id); }
}
```

### Autosave on `essay-edit`

```ts
@Component({ /* ... */ })
export class EssayEditComponent {
  private essays  = inject(EssaysService);
  private destroy$ = new Subject<void>();

  save$ = new Subject<{ html: string; json: any }>();
  saving = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');

  ngOnInit() {
    this.save$
      .pipe(debounceTime(1500), takeUntil(this.destroy$))
      .subscribe(({ html, json }) => {
        this.saving.set('saving');
        this.essays.update(this.id, { answer_html: html, answer_json: json }).subscribe({
          next: () => this.saving.set('saved'),
          error: () => this.saving.set('error'),
        });
      });
  }
}
```

## 8. Security checklist

- **HTML sanitization** on render: pipe through `DOMPurify` then Angular's
  `DomSanitizer.bypassSecurityTrustHtml`.
- **CKEditor** configured to disallow `<script>`, external embeds, etc., but
  sanitization is still the safety net.
- **Anon key** is OK in the bundle; RLS is the real boundary.
- **No service-role key** ever ships in client code.
- **Magic-link / OAuth** can be added later just by enabling it on Supabase and
  wiring `signInWithOAuth()`.

## 9. Implementation steps (ordered)

1. **Scaffold**: `ng new` at repo root with `--standalone --routing --style=scss --ssr=false`.
2. **Install deps**: `@supabase/supabase-js`, `@ckeditor/ckeditor5-angular`, `ckeditor5`, `dompurify`, UI lib (Material or Tailwind).
3. **Supabase project**: create on supabase.com; paste URL + anon key into
   `environments/environment.ts`.
4. **Schema**: run the SQL in §4 in the Supabase SQL editor.
5. **Core services**: `SupabaseService` → `AuthService` → `EssaysService`.
6. **Auth guard + routes**.
7. **Auth pages**: login + signup, swap to `/app` on success.
8. **List / dashboard** with empty/loading states.
9. **New / Edit / View** components, wired through `EssaysService`.
10. **Autosave** + "Saved / Saving…" status pill.
11. **Sanitization + export** (HTML / Markdown download).
12. **Styling pass** — typography for reading long answers is important.
13. **Manual smoke test**: signup → create → write → autosave → finish → view →
    search → delete.
14. **Deploy**: `ng build`, push to chosen static host, set production env vars.

## 10. Open decisions to confirm before/during build

- **UI library**: Angular Material vs Tailwind vs hand-rolled SCSS.
- **Auth providers**: email/password only, or also Google/GitHub OAuth?
- **Export formats**: HTML only, or also Markdown/PDF?
- **Word count**: client-side at save or DB-side via the generated column?
- **Editor**: commit to CKEditor 5, or start lighter with `ngx-quill` and swap later?

## 11. Future ideas (v2+)

- **Tagging** (`tags text[]` on `essays`) with chip UI + filter on dashboard.
- **Full-text search** (Postgres `tsvector` + GIN index for question + answer).
- **Reading mode** — toggle to a distraction-free, well-typeset view.
- **Spaced review** — show one essay a day from the archive to re-read.
- **Markdown import/export**.
- **Public share links** (optional per essay, signed URL with revocation).
- **Keyboard shortcuts** (cmd-S save, cmd-Enter mark finished).
- **Mobile-first PWA** — offline reading of finished essays.

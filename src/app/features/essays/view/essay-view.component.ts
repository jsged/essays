import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { Essay } from '../../../core/essay.model';
import { EssaysService } from '../../../core/essays.service';
import { errorMessage } from '../../../core/error-message';
import { SafeHtmlPipe } from '../../../shared/pipes/safe-html.pipe';
import { MenuBarComponent } from '../../../shared/menu-bar/menu-bar.component';
import { MenuActionId, MenuCategory } from '../../../shared/menu-bar/menu.types';

// View-side mirror of the editor's relative-time pill, computed from
// `updated_at` (the same source the editor uses post-save). Kept here
// so the read view can show "Last updated 2 min ago" without a custom
// pipe just for one label.
function relativeTime(iso: string): string {
  const at = new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

@Component({
  selector: 'app-essay-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, SafeHtmlPipe, MenuBarComponent],
  template: `
    @if (essay(); as e) {
      <article class="view">
        <header class="view-header">
          <a routerLink="/app" class="back">← All Essays</a>
          <h1 class="question">{{ e.question }}</h1>
          <div class="header-meta">
            <span class="status" [attr.data-status]="e.status">{{ e.status }}</span>
            <span class="meta-time">Last updated {{ updatedAgo() }}</span>
            <span class="meta-time">·</span>
            <span class="meta-time">Updated {{ e.updated_at | date: 'medium' }}</span>
          </div>
        </header>

        <!--
          Chrome container — mirrors the editor's unified menu + ruler
          surface. Two rows (menu / ruler) inside one sticky section
          with one border and one shadow, so the view feels like the
          same desktop app rather than a separate page.
        -->
        <section class="chrome">
          <div class="chrome-row chrome-row-menu">
            <app-menu-bar
              [menus]="menus"
              (action)="onMenuAction($event)"
            >
              <a right-actions [routerLink]="['/app/edit', e.id]" class="menu-item menu-cta"
                (mousedown)="$event.preventDefault()">Edit</a>
            </app-menu-bar>
          </div>

          <!--
            Ruler. Same 1-7 tick geometry as the editor. Pure decoration;
            no interaction. aria-hidden because it conveys no info to AT.
          -->
          <div class="chrome-row chrome-row-ruler">
            <div class="ruler" aria-hidden="true">
              <div class="ruler-track">
                @for (n of rulerTicks; track n) {
                  <span class="tick" [attr.data-pos]="n">
                    <span class="tick-mark"></span>
                    <span class="tick-label">{{ n }}</span>
                  </span>
                }
              </div>
            </div>
          </div>
        </section>

        <section class="paper">
          <div class="ribbon" aria-hidden="true"></div>
          <div class="paper-body">
            @if (e.answer_html) {
              <div class="answer" [innerHTML]="e.answer_html | safeHtml"></div>
            } @else {
              <p class="empty">No answer yet — open the editor to write one.</p>
            }
          </div>
          <div class="status-bar" aria-live="polite">
            <div class="status-bar-left">
              <span class="lang">English (UK)</span>
              <span aria-hidden="true">·</span>
              @if (e.word_count !== null) {
                <span><strong>{{ e.word_count }}</strong> {{ e.word_count === 1 ? 'word' : 'words' }}</span>
                <span aria-hidden="true">·</span>
              }
              @if (e.page_count !== null && e.page_count > 0) {
                <span><strong>{{ e.page_count }}</strong> {{ e.page_count === 1 ? 'page' : 'pages' }}</span>
              }
            </div>
            <div class="status-bar-right">
              <span class="status-bar-time">Updated {{ e.updated_at | date: 'short' }}</span>
              <span aria-hidden="true">·</span>
              <span class="zoom" aria-label="Zoom level">100%</span>
            </div>
          </div>
        </section>
      </article>
    } @else if (loadError()) {
      <p class="error" role="alert">{{ loadError() }}</p>
      <p><a routerLink="/app">Back to dashboard</a></p>
    } @else {
      <!--
        Visible loading state. The previous muted "Loading..." paragraph
        was 16px #6b7280 on a #f3f4f6 host — effectively invisible on a
        desktop monitor and easy to mistake for a blank page. Centered
        in a paper-shaped container so it reads as "the essay is
        loading" rather than "the page is broken".
      -->
      <div class="loading-state">
        <div class="loading-card">
          <p class="loading-label">Loading essay…</p>
        </div>
      </div>
    }
  `,
  styles: [
    `
      /* ---- Desk ---- */
      :host {
        display: block;
        background: #f3f4f6;
        min-height: 100vh;
        padding-bottom: 2.5rem;
      }
      .view { padding: 1rem 1.25rem 0; }

      /* ---- Header ---- */
      .view-header {
        max-width: 816px;
        margin: 0 auto 1.25rem;
        padding-bottom: 1.75rem;
      }
      .back {
        display: inline-block;
        color: #6b7280;
        text-decoration: none;
        font-size: 0.85rem;
        margin-bottom: 0.5rem;
        transition: color 120ms ease;
      }
      .back:hover { color: #111827; }
      .question {
        font-size: 1.75rem;
        line-height: 1.25;
        margin: 0 0 12px;
        color: #111827;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .header-meta {
        display: flex;
        gap: 0.6rem;
        align-items: center;
        flex-wrap: wrap;
        font-size: 0.85rem;
        color: #6b7280;
      }
      .status {
        font-size: 0.7rem;
        text-transform: uppercase;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        letter-spacing: 0.04em;
        font-weight: 600;
      }
      .status[data-status='draft'] { background: #fef3c7; color: #92400e; }
      .status[data-status='finished'] { background: #d1fae5; color: #065f46; }
      .meta-time { color: #6b7280; }

      /* ---- Unified chrome container (menu + ruler) ----
         Same pattern as the editor: one sticky section, one border,
         one shadow. The inner rows are relative-positioned so they
         scroll with the container. */
      .chrome {
        position: sticky;
        top: 56px;
        z-index: 7;
        max-width: 816px;
        margin: 0 auto 12px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        overflow: hidden;
      }
      .chrome-row { position: relative; }
      .chrome-row + .chrome-row { border-top: 1px solid #e5e7eb; }
      /* The right-side Edit CTA is projected into MenuBarComponent via
         [right-actions]. These styles stay here because the projected
         content is part of the view's encapsulation context, so the
         view's own CSS rules apply to it. */
      .menu-item {
        background: transparent;
        border: 0;
        padding: 0 10px;
        height: 28px;
        font-family: inherit;
        font-size: 0.83rem;
        color: #1f2937;
        border-radius: 6px;
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        transition: background 150ms ease-out, color 150ms ease-out;
      }
      .menu-item:hover { background: #eef4ff; color: #2b6ce5; }
      .menu-item:focus-visible { outline: 2px solid #2b6ce5; outline-offset: 1px; }
      .menu-cta {
        background: #1f2937;
        color: white;
        font-weight: 500;
      }
      .menu-cta:hover { background: #111827; color: white; text-decoration: none; }

      .ruler {
        height: 24px;
        padding: 0 96px;
        display: flex;
        align-items: center;
      }
      .ruler-track {
        position: relative;
        flex: 1 1 auto;
        height: 100%;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding-top: 4px;
      }
      .tick {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
      }
      .tick-mark {
        width: 1px;
        height: 8px;
        background: #6b7280;
      }
      .tick[data-pos='1'] .tick-mark,
      .tick[data-pos='7'] .tick-mark { height: 14px; }
      .tick-label { font-size: 0.65rem; color: #6b7280; line-height: 1; }

      /* ---- Paper ----
         Matches the editor's stronger shadow so the view feels like
         the same floating A4 sheet. */
      .paper {
        max-width: 816px;
        margin: 0 auto;
        background: #ffffff;
        box-shadow:
          0 2px 8px rgba(0, 0, 0, 0.05),
          0 10px 35px rgba(0, 0, 0, 0.08);
        border-radius: 8px;
        overflow: hidden;
      }
      .ribbon {
        height: 3px;
        background: linear-gradient(90deg, #2b6ce5 0%, #6366f1 100%);
      }
      .paper-body {
        padding: 96px;
        min-height: 50vh;
        font-family: 'Calibri', 'Inter', system-ui, sans-serif;
        color: #1f2937;
      }
      .empty { color: #6b7280; }
      .answer { line-height: 1.7; font-size: 1.05rem; color: #1f2937; }
      .answer :is(h1, h2, h3) { line-height: 1.3; }
      .answer h1 { font-size: 1.5rem; }
      .answer h2 { font-size: 1.25rem; }
      .answer h3 { font-size: 1.1rem; }
      .answer p { margin: 0.75em 0; }
      .answer :is(ul, ol) { padding-left: 1.5em; margin: 0.75em 0; }
      .answer blockquote {
        margin: 1em 0;
        padding: 0.5em 1em;
        border-left: 3px solid #d1d5db;
        color: #4b5563;
      }
      .answer a { color: #4f46e5; }
      .answer div[style*='page-break-after'],
      .answer div[style*='page-break-before'] {
        break-after: page;
        page-break-after: always;
        margin: 1rem -96px;
        padding: 1rem 96px;
        background: #f3f4f6;
        position: relative;
      }

      /* ---- Status bar ---- */
      .status-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.45rem 1rem;
        background: #e5e7eb;
        color: #4b5563;
        font-size: 0.78rem;
        border-top: 1px solid #d1d5db;
      }
      .status-bar-left, .status-bar-right {
        display: flex;
        gap: 0.85rem;
        align-items: center;
      }
      .status-bar-left strong { font-weight: 600; color: #1f2937; }
      .lang, .zoom { font-weight: 500; }
      .status-bar-time { color: #4b5563; font-weight: 500; }

      .error { color: #b91c1c; }

      /* ---- Loading state ----
         The view is loaded asynchronously from Supabase. Without a
         visible placeholder, users see a near-white page for 100-500ms
         on a fast network (longer on slow connections) and assume the
         page is broken. The .loading-state is a full-viewport flex
         center, and .loading-card is a paper-shaped card that mirrors
         the rest of the app's visual language. */
      .loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 60vh;
        padding: 4rem 1.25rem;
      }
      .loading-card {
        background: #ffffff;
        border-radius: 6px;
        box-shadow:
          0 1px 3px rgba(0, 0, 0, 0.08),
          0 6px 24px rgba(0, 0, 0, 0.08);
        padding: 1.5rem 2.5rem;
      }
      .loading-label {
        margin: 0;
        color: #4b5563;
        font-size: 0.95rem;
        font-weight: 500;
      }
      /* Subtle pulse so the user knows the page is actively loading
         (rather than stuck on a blank page). Respects prefers-reduced-motion. */
      .loading-card {
        animation: loading-pulse 1.6s ease-in-out infinite;
      }
      @keyframes loading-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%      { opacity: 0.7; transform: scale(0.98); }
      }
      @media (prefers-reduced-motion: reduce) {
        .loading-card { animation: none; }
      }

      /* ---- Mobile collapse ---- */
      @media (max-width: 600px) {
        :host { background: #ffffff; padding-bottom: 1rem; }
        .view { padding: 0.5rem 0.5rem 0; }
        .view-header { max-width: 100%; padding-bottom: 1rem; }
        .question { font-size: 1.35rem; }
        .chrome {
          max-width: 100%;
          border-radius: 0;
          border-left: 0;
          border-right: 0;
        }
        .chrome-row-ruler { display: none; }
        .paper {
          max-width: 100%;
          box-shadow: none;
          border-radius: 0;
        }
        .paper-body {
          padding: 16px;
          min-height: 30vh;
        }
        .answer div[style*='page-break-after'],
        .answer div[style*='page-break-before'] {
          margin: 1rem -16px;
          padding: 1rem 16px;
        }
        .status-bar { padding: 0.4rem 0.85rem; font-size: 0.7rem; }
        .status-bar-left, .status-bar-right { gap: 0.5rem; }
      }
    `,
  ],
})
export class EssayViewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly essaysSvc = inject(EssaysService);

  readonly essay = signal<Essay | null>(null);
  readonly loadError = signal<string | null>(null);
  // Ticks must be a class field (not a `const` outside the class) so the
  // template can reference them via `rulerTicks` directly.
  protected readonly rulerTicks = [1, 2, 3, 4, 5, 6, 7];

  // The read view exposes a smaller menu than the editor: File (Print,
  // Delete) + Help (Shortcuts, About). Edit/Insert/Format/Tools are
  // omitted on purpose — the view is read-only, so showing disabled
  // categories would be noise. The right-side Edit CTA covers the
  // most common "go back to editing" path.
  protected readonly menus: readonly MenuCategory[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'Print', actionId: 'file:print' },
        { isDivider: true },
        { label: 'Delete', actionId: 'file:delete' },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { label: 'Keyboard Shortcuts', actionId: 'help:shortcuts', shortcut: 'Ctrl+/' },
        { isDivider: true },
        { label: 'About', actionId: 'help:about' },
      ],
    },
  ];

  // Recomputed from `essay().updated_at` so the read view can show
  // "Last updated 2 min ago" without injecting a custom pipe. The
  // computed signal reacts when the essay signal is replaced.
  readonly updatedAgo = computed(() => {
    const e = this.essay();
    return e ? relativeTime(e.updated_at) : '';
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError.set('Missing essay id in URL.');
      return;
    }
    try {
      const e = await this.essaysSvc.get(id);
      this.essay.set(e);
    } catch (err) {
      this.loadError.set(errorMessage(err));
    }
  }

  async remove(): Promise<void> {
    const e = this.essay();
    if (!e) return;
    if (!confirm('Delete this essay? This cannot be undone.')) return;
    try {
      await this.essaysSvc.remove(e.id);
      await this.router.navigate(['/app']);
    } catch (err) {
      this.loadError.set(errorMessage(err));
    }
  }

  onMenuAction(actionId: MenuActionId): void {
    switch (actionId) {
      case 'file:print':
        window.print();
        return;
      case 'file:delete':
        void this.remove();
        return;
      case 'help:shortcuts':
        window.alert(
          'Keyboard shortcuts:\n\n' +
            'Esc      Close menu\n' +
            'Ctrl+P   Print\n' +
            'Ctrl+/   Open shortcuts',
        );
        return;
      case 'help:about':
        window.alert('EssaysApp\n\nA focused writing environment for your essays.');
        return;
      default:
        return;
    }
  }
}

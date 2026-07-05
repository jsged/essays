import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

import { EssayStatus } from '../../../core/essay.model';

// A single heading entry in the document outline. `index` counts only
// headings of the same `level` — that's the right granularity for the
// model-side selector used by `scrollToOutline`.
export interface OutlineItem {
  level: 1 | 2 | 3;
  text: string;
  index: number;
}

// Stats the editor hands to the inspector's Document tab.
export interface DocumentStats {
  words: number;
  characters: number;
  paragraphs: number;
  readingTimeMin: number;
}

type TabId = 'document' | 'outline' | 'comments' | 'ai';

interface TabDef {
  id: TabId;
  label: string;
}

// 200 wpm is the canonical estimate used by Medium, Pocket, etc. Good
// enough for a "Reading time" callout; not pretending to be precise.
const READING_WPM = 200;

@Component({
  selector: 'app-essay-inspector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    @if (isOpen) {
      <aside class="inspector" aria-label="Document inspector">
        <header class="inspector-head">
          <div class="tabs" role="tablist">
            @for (t of tabs; track t.id) {
              <button
                type="button"
                role="tab"
                class="tab"
                [class.active]="activeTab === t.id"
                [attr.aria-selected]="activeTab === t.id"
                (click)="tabChange.emit(t.id)"
              >
                {{ t.label }}
              </button>
            }
          </div>
          <button
            type="button"
            class="close"
            aria-label="Close inspector"
            (click)="close.emit()"
          >×</button>
        </header>

        <div class="inspector-body" role="tabpanel">
          @switch (activeTab) {
            @case ('document') {
              <section class="stats">
                <h3>Document</h3>
                <dl>
                  <div class="row">
                    <dt>Pages</dt>
                    <dd>{{ pages | number }}</dd>
                  </div>
                  <div class="row">
                    <dt>Language</dt>
                    <dd>{{ language }}</dd>
                  </div>
                  <div class="row">
                    <dt>Reading time</dt>
                    <dd>
                      @if (stats.readingTimeMin < 1) {
                        &lt; 1 min
                      } @else {
                        {{ stats.readingTimeMin }} min
                      }
                    </dd>
                  </div>
                  <div class="row">
                    <dt>Words</dt>
                    <dd>{{ stats.words | number }}</dd>
                  </div>
                  <div class="row">
                    <dt>Characters</dt>
                    <dd>{{ stats.characters | number }}</dd>
                  </div>
                  <div class="row">
                    <dt>Spell check</dt>
                    <dd>
                      @if (spellCheck) {
                        <span class="ok" aria-label="Passed">&#10003;</span>
                      } @else {
                        <span class="warn" aria-label="Issues">!</span>
                      }
                    </dd>
                  </div>
                  <div class="row">
                    <dt>Last edited</dt>
                    <dd>{{ lastEditedLabel() }}</dd>
                  </div>
                </dl>
                <p class="status-line">
                  <span class="dot" [attr.data-status]="status"></span>
                  {{ status === 'finished' ? 'Marked finished' : 'Draft' }}
                </p>
              </section>
            }
            @case ('outline') {
              <section class="outline">
                <h3>Outline</h3>
                @if (outline.length === 0) {
                  <p class="muted">
                    Add a heading (Heading 1, 2, or 3 from the toolbar) to
                    start building an outline.
                  </p>
                } @else {
                  <ul>
                    @for (item of outline; track $index) {
                      <li
                        class="outline-item"
                        [attr.data-level]="item.level"
                      >
                        <button
                          type="button"
                          (click)="outlineJump.emit(item)"
                        >
                          <span class="gutter" aria-hidden="true"></span>
                          <span class="text">{{ item.text }}</span>
                        </button>
                      </li>
                    }
                  </ul>
                }
              </section>
            }
            @case ('comments') {
              <section class="placeholder">
                <h3>Comments</h3>
                <p class="muted">No comments yet.</p>
                <p class="muted small">
                  Select text in the document and add a comment to start a
                  thread. Comments will appear here in a future update.
                </p>
              </section>
            }
            @case ('ai') {
              <section class="placeholder">
                <h3>AI Assistant</h3>
                <p class="muted">Coming soon.</p>
                <p class="muted small">
                  Ask the assistant to summarise, critique, or expand any
                  section of your essay.
                </p>
              </section>
            }
          }
        </div>
      </aside>
    }
  `,
  // Style budget is ~1.6kB. Kept terse and shared-class-heavy so the parent
  // component can afford menu-bar + ruler + toolbar styles in its own 8kB.
  styles: [
    `
      :host {
        display: contents;
      }
      .inspector {
        width: 280px;
        flex: 0 0 280px;
        background: #ffffff;
        /* Less card-like per the design feedback: the white background
           against the gray desk already separates it visually, so the
           heavy border + shadow + radius were redundant. The thin
           left divider hints at the panel boundary without screaming
           "I'm a card". */
        border: 0;
        border-left: 1px solid #e5e7eb;
        border-radius: 0;
        box-shadow: none;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 198px);
        position: sticky;
        /* Sticky offset matches the unified chrome height: 56 (topbar)
           + 40 (menu) + 52 (toolbar) + 24 (ruler) + 2 (chrome border
           x2) + 12 (breathing room) = 186. The chrome's own margin-bottom
           provides the 12-px gap to the paper. */
        top: 186px;
        align-self: flex-start;
      }
      .inspector-head {
        display: flex;
        align-items: stretch;
        justify-content: space-between;
        border-bottom: 1px solid #e5e7eb;
        background: #ffffff;
        border-radius: 0;
      }
      .tabs {
        display: flex;
        flex: 1 1 auto;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .tabs::-webkit-scrollbar {
        display: none;
      }
      .tab {
        flex: 1 1 0;
        background: transparent;
        border: 0;
        padding: 10px 8px;
        font-family: inherit;
        font-size: 0.78rem;
        color: #4b5563;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: color 120ms ease, border-color 120ms ease;
        white-space: nowrap;
      }
      .tab:hover {
        color: #111827;
      }
      .tab.active {
        color: #2b6ce5;
        border-bottom-color: #2b6ce5;
        font-weight: 600;
      }
      .close {
        flex: 0 0 auto;
        background: transparent;
        border: 0;
        font-size: 1.2rem;
        line-height: 1;
        color: #6b7280;
        cursor: pointer;
        padding: 0 12px;
      }
      .close:hover {
        color: #111827;
      }
      .inspector-body {
        overflow-y: auto;
        padding: 16px;
        font-size: 0.875rem;
      }
      .inspector-body h3 {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #6b7280;
        margin: 0 0 12px;
        font-weight: 600;
      }
      .stats dl {
        margin: 0;
        display: grid;
        gap: 10px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding-bottom: 8px;
        border-bottom: 1px dashed #e5e7eb;
      }
      .row:last-child {
        border-bottom: 0;
      }
      .row dt {
        color: #6b7280;
        font-size: 0.82rem;
      }
      .row dd {
        margin: 0;
        color: #111827;
        font-weight: 600;
        font-feature-settings: 'tnum';
      }
      .ok { color: #059669; font-size: 1rem; }
      .warn { color: #d97706; font-size: 1rem; }
      .status-line {
        margin: 16px 0 0;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8rem;
        color: #4b5563;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #d1d5db;
      }
      .dot[data-status='finished'] {
        background: #059669;
      }
      .dot[data-status='draft'] {
        background: #d97706;
      }
      .outline ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .outline-item button {
        all: unset;
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
        color: #1f2937;
      }
      .outline-item button:hover {
        background: #eef4ff;
      }
      .outline-item .gutter {
        flex: 0 0 auto;
        width: 3px;
        height: 14px;
        background: #d1d5db;
        border-radius: 2px;
      }
      .outline-item[data-level='1'] .gutter { background: #2b6ce5; }
      .outline-item[data-level='2'] .gutter { background: #6366f1; }
      .outline-item[data-level='3'] .gutter { background: #94a3b8; }
      .outline-item[data-level='2'] button { padding-left: 20px; }
      .outline-item[data-level='3'] button { padding-left: 32px; font-size: 0.8rem; }
      .outline-item .text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .placeholder p {
        line-height: 1.5;
        margin: 0 0 8px;
      }
      .muted {
        color: #6b7280;
      }
      .small {
        font-size: 0.78rem;
      }

      /* Hide the inspector on phones — the page should be the focus. */
      @media (max-width: 900px) {
        .inspector {
          display: none;
        }
      }
    `,
  ],
})
export class EssayInspectorComponent {
  // Inputs are simple values so the parent editor can pass plain signals
  // (no need for `input()` from the new signal-forms API).
  @Input() isOpen = true;
  @Input() activeTab: TabId = 'document';
  @Input() stats: DocumentStats = {
    words: 0,
    characters: 0,
    paragraphs: 0,
    readingTimeMin: 0,
  };
  @Input() outline: readonly OutlineItem[] = [];
  @Input() status: EssayStatus = 'draft';
  // Extended Document-tab fields added in the v3 polish pass. Defaults
  // make the inputs optional so callers that only need the original
  // four stats still compile cleanly.
  @Input() pages = 1;
  @Input() language = 'English (UK)';
  @Input() spellCheck = true;
  @Input() lastEditedAt: Date | null = null;

  @Output() tabChange = new EventEmitter<TabId>();
  @Output() outlineJump = new EventEmitter<OutlineItem>();
  @Output() close = new EventEmitter<void>();

  // Tab order matches the user's mockup: Document, Outline, Comments,
  // AI Assistant. The AI tab is a placeholder for a future feature; the
  // Comments tab will be a future feature too. Both render as
  // "no content yet" placeholders, intentionally.
  protected readonly tabs: readonly TabDef[] = [
    { id: 'document', label: 'Document' },
    { id: 'outline', label: 'Outline' },
    { id: 'comments', label: 'Comments' },
    { id: 'ai', label: 'AI' },
  ];

  // "Last edited 22:51" — short time-of-day for the inspector. Kept
  // terse: hours and minutes only, in the user's locale.
  lastEditedLabel(): string {
    if (!this.lastEditedAt) return '—';
    const d = this.lastEditedAt;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}

// Helper used by the editor to compute stats without duplicating logic.
// Kept as a pure function so it's testable and side-effect free.
export function computeDocumentStats(html: string): DocumentStats {
  const text = stripHtml(html);
  const words = text === '' ? 0 : (text.match(/\S+/g) ?? []).length;
  const characters = text.length;
  const paragraphs = countParagraphs(html);
  const readingTimeMin = words === 0 ? 0 : Math.max(1, Math.round(words / READING_WPM));
  return { words, characters, paragraphs, readingTimeMin };
}

function countParagraphs(html: string): number {
  if (stripHtml(html) === '') return 0;
  // Each block-level element starts a new "paragraph" for the inspector.
  // Matches the same shapes CKEditor 5 emits for paragraphs, headings,
  // list items, and blockquotes.
  const matches = html.match(/<(p|h[1-6]|li|blockquote)\b[^>]*>/gi);
  return matches?.length ?? 0;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

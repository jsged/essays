import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChangeEvent, CKEditorModule } from '@ckeditor/ckeditor5-angular';
import { ClassicEditor } from '@ckeditor/ckeditor5-editor-classic';
import { Essentials } from '@ckeditor/ckeditor5-essentials';
import { Paragraph } from '@ckeditor/ckeditor5-paragraph';
import { Heading } from '@ckeditor/ckeditor5-heading';
import {
  Bold,
  Italic,
  Underline,
} from '@ckeditor/ckeditor5-basic-styles';
import { Link } from '@ckeditor/ckeditor5-link';
import { List } from '@ckeditor/ckeditor5-list';
import { BlockQuote } from '@ckeditor/ckeditor5-block-quote';
import { PageBreak } from '@ckeditor/ckeditor5-page-break';
import { Undo } from '@ckeditor/ckeditor5-undo';
import { Alignment } from '@ckeditor/ckeditor5-alignment';
import { Indent, IndentBlock } from '@ckeditor/ckeditor5-indent';
import { Font } from '@ckeditor/ckeditor5-font';
import { Subject, debounceTime, filter } from 'rxjs';

import { Essay, EssayStatus } from '../../../core/essay.model';
import { errorMessage } from '../../../core/error-message';
import { EssaysService } from '../../../core/essays.service';

import { MenuBarComponent } from '../../../shared/menu-bar/menu-bar.component';
import { MenuActionId, MenuCategory } from '../../../shared/menu-bar/menu.types';
import { buildEditorMenus } from './editor-menu';
import {
  handleEditorMenuAction,
} from './editor-menu-actions';

const MAX_AUTOSAVE_RETRIES = 3;
const WORD_REGEX = /\S+/g;
const PAGE_REGEX = /<[^>]*page-break-\s+(after|before)[^>]*>/g;

interface ActiveStates {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  bulletedList: boolean;
  numberedList: boolean;
  blockQuote: boolean;
  link: boolean;
  heading: 'paragraph' | 'heading1' | 'heading2' | 'heading3';
  alignment: 'left' | 'center' | 'right' | 'justify';
  fontFamily: string;
  fontSize: string;
  canUndo: boolean;
  canRedo: boolean;
}

type HeadingValue = ActiveStates['heading'];
type AlignmentValue = ActiveStates['alignment'];
const INITIAL_ACTIVE: ActiveStates = {
  bold: false,
  italic: false,
  underline: false,
  bulletedList: false,
  numberedList: false,
  blockQuote: false,
  link: false,
  heading: 'paragraph',
  alignment: 'left',
  fontFamily: 'Calibri, "Inter", system-ui, sans-serif',
  fontSize: '12',
  canUndo: false,
  canRedo: false,
};

// Font list kept short on purpose — these are the families most users
// reach for. Adding the full system font list would crowd the toolbar.
const FONT_FAMILIES = [
  { label: 'Calibri', value: 'Calibri, "Inter", system-ui, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Inter', value: '"Inter", system-ui, sans-serif' },
] as const;

// Standard Word/Google-Docs font sizes in points.
const FONT_SIZES = ['9', '10', '11', '12', '14', '16', '18', '24', '30', '36', '48'] as const;

function stripHtml(s: string | null | undefined): string {
  return (s ?? '').replace(/<[^>]*>/g, ' ').trim();
}

function liveWordCount(html: string): number {
  const text = stripHtml(html);
  return text === '' ? 0 : (text.match(WORD_REGEX) ?? []).length;
}

function livePageCount(html: string): number {
  if (stripHtml(html) === '') return 0;
  return ((html.match(PAGE_REGEX) ?? []).length) + 1;
}

@Component({
  selector: 'app-essay-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CKEditorModule, MenuBarComponent],
  template: `
    @if (essay(); as e) {
      <article class="edit">
        <header class="edit-header">
          <div class="header-row">
            <a routerLink="/app" class="back">← All Essays</a>
            <div class="header-actions">
              <a [routerLink]="['/app/view', e.id]" class="header-link"
                (mousedown)="$event.preventDefault()">View</a>
              <button type="button" class="header-cta"
                (mousedown)="$event.preventDefault()"
                (click)="toggleStatus()">
                {{ e.status === 'finished' ? 'Reopen draft' : 'Mark finished' }}
              </button>
            </div>
          </div>
          <h1 class="question">{{ e.question }}</h1>
          <div class="header-meta">
            <span class="status" [attr.data-status]="e.status">{{ e.status }}</span>
            <span class="save-pill" [attr.data-state]="saveState()">
              {{ relativeSavedLabel() }}
            </span>
            @if (saveError()) {
              <p class="error-note" role="alert">{{ saveError() }}</p>
            }
          </div>
          @if (statusError()) {
            <p class="status-error" role="alert">
              Couldn't update status: {{ statusError() }}
            </p>
          }
        </header>

        <!--
          Unified chrome container. Holds the menu bar, the formatting
          toolbar, and the ruler in a single sticky section with one
          border, one radius, and one shadow — the previous design had
          three separate sticky boxes, which read as three competing
          surfaces rather than one toolbar. The container pins below
          the 56-px topbar; the inner rows are relative-positioned so
          they scroll with the container.
        -->
        <section class="chrome">
          <div class="chrome-row chrome-row-menu">
            <app-menu-bar
              [menus]="menus()"
              (action)="onMenuAction($event)"
            />
          </div>

          <!--
            Custom formatting toolbar. CKEditor's own toolbar is suppressed
            via editorConfig.toolbar: [] below. Each button is wired to
            editor.execute(...) and uses (mousedown).preventDefault() so the
            editor doesn't lose focus when the user clicks the chrome.
          -->
          <div class="chrome-row chrome-row-toolbar">
            <div class="format-toolbar" role="toolbar" aria-label="Formatting">
          <button type="button" class="tb-btn" aria-label="Undo"
            [disabled]="!editorReady() || !activeStates().canUndo"
            (mousedown)="$event.preventDefault()"
            (click)="executeCommand('undo')">↶</button>
          <button type="button" class="tb-btn" aria-label="Redo"
            [disabled]="!editorReady() || !activeStates().canRedo"
            (mousedown)="$event.preventDefault()"
            (click)="executeCommand('redo')">↷</button>
          <span class="tb-divider" aria-hidden="true"></span>
          <select class="tb-select tb-select-wide" aria-label="Font family"
            [disabled]="!editorReady()"
            [value]="fontFamilyValue()"
            (change)="setFontFamily(getSelectValue($event))">
            @for (f of fontFamilies; track f.label) {
              <option [value]="f.value">{{ f.label }}</option>
            }
          </select>
          <select class="tb-select tb-select-narrow" aria-label="Font size"
            [disabled]="!editorReady()"
            [value]="fontSizeValue()"
            (change)="setFontSize(getSelectValue($event))">
            @for (s of fontSizes; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
          <span class="tb-divider" aria-hidden="true"></span>
          <select class="tb-select" aria-label="Heading style"
            [disabled]="!editorReady()"
            [value]="activeStates().heading"
            (change)="executeCommand('heading', getSelectValue($event))">
            <option value="paragraph">Paragraph</option>
            <option value="heading1">Heading 1</option>
            <option value="heading2">Heading 2</option>
            <option value="heading3">Heading 3</option>
          </select>
          <span class="tb-divider" aria-hidden="true"></span>
          <button type="button" class="tb-btn" aria-label="Bold"
            [attr.aria-pressed]="activeStates().bold"
            [class.active]="activeStates().bold"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="executeCommand('bold')"><strong>B</strong></button>
          <button type="button" class="tb-btn" aria-label="Italic"
            [attr.aria-pressed]="activeStates().italic"
            [class.active]="activeStates().italic"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="executeCommand('italic')"><em>I</em></button>
          <button type="button" class="tb-btn" aria-label="Underline"
            [attr.aria-pressed]="activeStates().underline"
            [class.active]="activeStates().underline"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="executeCommand('underline')"><u>U</u></button>
          <button type="button" class="tb-btn tb-color" aria-label="Text color"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="setFontColor('#1f2937')">
            <span class="tb-color-letter">A</span>
            <span class="tb-color-bar" style="background:#1f2937"></span>
          </button>
          <button type="button" class="tb-btn tb-color" aria-label="Highlight"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="setHighlight('#fef08a')">
            <span class="tb-color-letter highlight">ab</span>
            <span class="tb-color-bar" style="background:#fef08a"></span>
          </button>
          <span class="tb-divider" aria-hidden="true"></span>
          <button type="button" class="tb-btn" aria-label="Align left"
            [attr.aria-pressed]="activeStates().alignment === 'left'"
            [class.active]="activeStates().alignment === 'left'"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="setAlignment('left')">⫷≡</button>
          <button type="button" class="tb-btn" aria-label="Align center"
            [attr.aria-pressed]="activeStates().alignment === 'center'"
            [class.active]="activeStates().alignment === 'center'"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="setAlignment('center')">≡⫸</button>
          <button type="button" class="tb-btn" aria-label="Align right"
            [attr.aria-pressed]="activeStates().alignment === 'right'"
            [class.active]="activeStates().alignment === 'right'"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="setAlignment('right')">≡⫶</button>
          <button type="button" class="tb-btn" aria-label="Justify"
            [attr.aria-pressed]="activeStates().alignment === 'justify'"
            [class.active]="activeStates().alignment === 'justify'"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="setAlignment('justify')">≡</button>
          <span class="tb-divider" aria-hidden="true"></span>
          <button type="button" class="tb-btn" aria-label="Bulleted list"
            [attr.aria-pressed]="activeStates().bulletedList"
            [class.active]="activeStates().bulletedList"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="executeCommand('bulletedList')">•</button>
          <button type="button" class="tb-btn" aria-label="Numbered list"
            [attr.aria-pressed]="activeStates().numberedList"
            [class.active]="activeStates().numberedList"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="executeCommand('numberedList')">1.</button>
          <button type="button" class="tb-btn" aria-label="Outdent"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="executeCommand('outdent')">⇤</button>
          <button type="button" class="tb-btn" aria-label="Indent"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="executeCommand('indent')">⇥</button>
          <span class="tb-divider" aria-hidden="true"></span>
          <button type="button" class="tb-btn" aria-label="Block quote"
            [attr.aria-pressed]="activeStates().blockQuote"
            [class.active]="activeStates().blockQuote"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="executeCommand('blockQuote')">"</button>
          <span class="tb-divider" aria-hidden="true"></span>
          <button type="button" class="tb-btn" aria-label="Insert link"
            [attr.aria-pressed]="activeStates().link"
            [class.active]="activeStates().link"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="executeCommand('link')">🔗</button>
          <button type="button" class="tb-btn" aria-label="Insert page break"
            [disabled]="!editorReady()"
            (mousedown)="$event.preventDefault()"
            (click)="executeCommand('pageBreak')">⎯⎯</button>
          <span class="tb-divider" aria-hidden="true"></span>

            </div>
          </div>

          @if (showRuler()) {
            <!--
              Ruler. The 1–7 tick marks roughly match the 1″-margin geometry
              of a US Letter page (816px wide). The outer ticks (white margin)
              are intentionally slightly longer than the inner ticks (white
              inside the page) to evoke the "margin gutter" look from Word.
              Toggled via View > Show Ruler.
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
          }
        </section>

        <div class="workspace">
          <div class="editor-frame">
            <div class="ribbon" aria-hidden="true"></div>
            <!-- CSS zoom is non-standard but works in Chromium / WebKit
                 and is the simplest way to scale the editor's editable
                 area without reflow. Firefox ignores it (the status
                 bar value still updates, but the content doesn't
                 visually scale). -->
            <div class="editor-host" [style.zoom]="zoom() + '%'">
              <ckeditor
                [editor]="Editor"
                [config]="editorConfig"
                [data]="e.answer_html ?? ''"
                (change)="onChange($event)"
                (ready)="onReady($event)"
              />
            </div>
            @if (showStatusBar()) {
              <div class="status-bar" aria-live="polite">
              <div class="status-bar-left">
                <span class="lang">English (UK)</span>
                <span aria-hidden="true">·</span>
                <span><strong>{{ liveWordCount() }}</strong> {{ liveWordCount() === 1 ? 'word' : 'words' }}</span>
                <span aria-hidden="true">·</span>
                <span>Page <strong>{{ livePageCount() }}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Ln <strong>{{ selection().line }}</strong> Col <strong>{{ selection().column }}</strong></span>
                <span aria-hidden="true">·</span>
                <span class="status-bar-save" [attr.data-state]="saveState()">{{ saveLabel() }}</span>
              </div>
              <div class="status-bar-right">
                <button type="button" class="status-bar-link"
                  aria-label="Accessibility settings"
                  (mousedown)="$event.preventDefault()">Accessibility</button>
                <span aria-hidden="true">·</span>
                <div class="zoom-controls" role="group" aria-label="Zoom">
                  <button type="button" class="zoom-btn"
                    aria-label="Zoom out"
                    (mousedown)="$event.preventDefault()"
                    (click)="zoomOut()">−</button>
                  <button type="button" class="zoom-btn zoom-value"
                    aria-label="Reset zoom"
                    (mousedown)="$event.preventDefault()"
                    (click)="zoom.set(100)">{{ zoom() }}%</button>
                  <button type="button" class="zoom-btn"
                    aria-label="Zoom in"
                    (mousedown)="$event.preventDefault()"
                    (click)="zoomIn()">+</button>
                </div>
              </div>
            </div>
            }
          </div>


        </div>
      </article>
    } @else if (loadError()) {
      <p class="error" role="alert">{{ loadError() }}</p>
      <p><a routerLink="/app">Back to dashboard</a></p>
    } @else {
      <!--
        Visible loading state. The previous <p class="muted"> was 16px
        #6b7280 on a #f3f4f6 host — effectively invisible on a desktop
        monitor and easy to mistake for a blank page while the essay
        loads from Supabase. Centered in a paper-shaped card with a
        pulse animation so the user knows the page is actively
        working, not broken. Mirrors the view's loading card.
      -->
      <div class="loading-state">
        <div class="loading-card">
          <p class="loading-label">Loading editor…</p>
        </div>
      </div>
    }
  `,
  styles: [
    `
      /* ---- Desk (host) ----
         The host is a flat gray "desk" that contains the floating paper.
         The padding-bottom ensures the bottom of long documents doesn't
         tuck under the status bar when the page reaches its last tick. */
      :host {
        display: block;
        background: #f3f4f6;
        min-height: 100vh;
        padding-bottom: 2.5rem;
      }
      .edit {
        padding: 1rem 1.25rem 0;
      }

      /* ---- Header (question, status, last-saved) ---- */
      .edit-header {
        max-width: 816px;
        margin: 0 auto 1.25rem;
        padding-bottom: 1.75rem;
      }
      .header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.5rem;
      }
      .header-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }
      .header-link {
        background: transparent;
        border: 0;
        padding: 0.4rem 0.75rem;
        color: #4b5563;
        font-size: 0.85rem;
        font-weight: 500;
        border-radius: 6px;
        cursor: pointer;
        text-decoration: none;
        font-family: inherit;
        transition: background 120ms ease, color 120ms ease;
      }
      .header-link:hover { background: #eef4ff; color: #2b6ce5; }
      .header-cta {
        background: #1f2937;
        color: white;
        border: 0;
        padding: 0.4rem 0.85rem;
        font-size: 0.85rem;
        font-weight: 500;
        border-radius: 6px;
        cursor: pointer;
        font-family: inherit;
        transition: background 120ms ease;
      }
      .header-cta:hover { background: #111827; }
      .back {
        display: inline-block;
        color: #6b7280;
        text-decoration: none;
        font-size: 0.85rem;
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
      .save-pill { font-size: 0.8rem; }
      .save-pill[data-state='saving'] { color: #d97706; }
      .save-pill[data-state='saved'] { color: #059669; }
      .save-pill[data-state='error'] { color: #dc2626; }
      .error-note, .status-error {
        color: #b91c1c;
        font-size: 0.85rem;
        line-height: 1.4;
        margin: 0.35rem 0 0;
      }

      /* ---- Unified chrome container ----
         One sticky section holds the menu bar, the formatting toolbar,
         and the ruler. Previously these were three independent sticky
         elements with three borders and three shadows, which read as
         three competing surfaces. The container pins below the 56-px
         topbar; the inner rows are relative-positioned so they scroll
         with the container. max-width: 816 so the chrome's left edge
         aligns with the paper's left edge. */
      .chrome {
        position: sticky;
        top: 56px;
        z-index: 7;
        margin: 0 0 12px;
        padding: 0;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 0;
      }
      .chrome-row {
        position: relative;
      }
.chrome-row-ruler{max-width:816px;margin:0 auto}
      .chrome-row + .chrome-row {
        border-top: 1px solid #e5e7eb;
      }
      .chrome-row:first-child {
        border-top-left-radius: 8px;
        border-top-right-radius: 8px;
      }
      .chrome-row:last-child {
        border-bottom-left-radius: 8px;
        border-bottom-right-radius: 8px;
      }
      .format-toolbar {
        border-bottom-right-radius: 8px;
        height: 52px;
        padding: 0 8px;
        display: flex;
        align-items: center;
        gap: 3px;
        overflow-x: auto;
        scrollbar-width: thin;
      }
      .tb-btn {
        height: 36px;
        min-width: 32px;
        padding: 0 6px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        color: #1f2937;
        font-family: inherit;
        font-size: 0.95rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        transition: background 150ms ease-out, border-color 150ms ease-out;
      }
      .tb-btn:hover:not(:disabled) { background: #eef4ff; }
      .tb-btn:disabled { opacity: 0.4; cursor: default; }
      .tb-btn.active {
        background: rgba(43, 108, 229, 0.1);
        border-color: #2b6ce5;
        color: #2b6ce5;
      }
      .tb-btn:focus-visible { outline: 2px solid #2b6ce5; outline-offset: 1px; }
      .tb-color {
        flex-direction: column;
        gap: 1px;
        height: 36px;
        width: 36px;
        padding: 2px 0 0;
      }
      .tb-color-letter {
        font-size: 0.85rem;
        font-weight: 700;
        line-height: 1;
        color: #ef4444;
      }
      .tb-color-letter.highlight {
        color: #111827;
        background: #fef08a;
        padding: 0 3px;
        border-radius: 2px;
        font-size: 0.75rem;
      }
      .tb-color-bar {
        width: 16px;
        height: 3px;
        border-radius: 2px;
      }
      .tb-icon { font-size: 1.05rem; }
      .tb-select {
        height: 32px;
        padding: 0 0.5rem;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        font-family: inherit;
        font-size: 0.85rem;
        color: #1f2937;
        cursor: pointer;
        flex: 0 0 auto;
      }
      .tb-select-wide { min-width: 140px; }
      .tb-select-narrow { min-width: 56px; }
      .tb-select:hover:not(:disabled) { background: #eef4ff; }
      .tb-select:focus-visible { outline: 2px solid #2b6ce5; outline-offset: 1px; }
      .tb-select:disabled { opacity: 0.4; }
      .tb-divider {
        width: 1px;
        height: 24px;
        background: #e5e7eb;
        margin: 0 4px;
        flex: 0 0 auto;
      }

      /* ---- Ruler (inside the chrome container) ----
         96px side padding matches the paper's 1" left/right margin, so
         the tick marks sit exactly above the page area. */
      .ruler {
        height: 24px;
        max-width: 816px;
        margin: 0 auto;
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
        position: relative;
      }
      .tick-mark {
        width: 1px;
        height: 8px;
        background: #6b7280;
      }
      .tick-label {
        font-size: 0.65rem;
        color: #6b7280;
        line-height: 1;
      }
      /* The first and last ticks live in the page-margin gutter, so their
         marks are taller to read as "the page edges". */
      .tick[data-pos='1'] .tick-mark,
      .tick[data-pos='7'] .tick-mark { height: 14px; }

      /* ---- Workspace (paper) ---- */
      .workspace {
        max-width: 816px;
        margin: 0 auto;
      }

      /* ---- Paper ---- */
      .editor-frame {
        max-width: 816px;
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
      .editor-host { background: #ffffff; }

      /* CKEditor overrides — strip its border so the toolbar + paper own
         the chrome. Padding of 96px ≈ 1" margin references Word's default
         page geometry. Calibri is the body font (closest free substitute
         is Inter, then system sans). */
      .editor-host ::ng-deep .ck-editor {
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
      .editor-host ::ng-deep .ck-toolbar { display: none !important; }
      .editor-host ::ng-deep .ck-editor__editable {
        min-height: 60vh;
        padding: 96px;
        line-height: 1.65;
        font-size: 1rem;
        background: #ffffff;
        font-family: 'Calibri', 'Inter', system-ui, sans-serif;
        color: #1f2937;
      }
      .editor-host ::ng-deep .ck-content ::selection {
        background: rgba(43, 108, 229, 0.18);
        color: inherit;
      }
      /* CKEditor 5's screen-reader-only label. The default
         .ck-voice-label styles are not taking effect in this build (the
         label is rendering visibly above the editor as "Rich Text
         Editor"), so we re-state the visually-hidden pattern. The
         element stays in the DOM and is still discoverable by AT —
         it's just no longer visible. */
      .editor-host ::ng-deep .ck-voice-label {
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        padding: 0 !important;
        overflow: hidden !important;
        clip: rect(0, 0, 0, 0) !important;
        clip-path: inset(50%) !important;
        white-space: nowrap !important;
        border: 0 !important;
      }
      .editor-host ::ng-deep .ck-content div[style*='page-break-after'],
      .editor-host ::ng-deep .ck-content div[style*='page-break-before'] {
        break-after: page;
        page-break-after: always;
        margin: 1rem -96px;
        padding: 1rem 96px;
        background: #f3f4f6;
        position: relative;
      }
      .editor-host ::ng-deep
        .ck-content div[style*='page-break-after']::before,
      .editor-host ::ng-deep
        .ck-content div[style*='page-break-before']::before { display: none; }

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
      .status-bar-left strong, .status-bar-right strong { font-weight: 600; color: #1f2937; }
      .lang { font-weight: 500; }
      .status-bar-link {
        background: transparent; border: 0; padding: 0;
        font: inherit; font-size: 0.78rem; font-weight: 500;
        color: #4b5563; cursor: pointer;
        transition: color 150ms ease-out;
      }
      .status-bar-link:hover { color: #2b6ce5; }
      .status-bar-save { font-weight: 600; }
      .status-bar-save[data-state='saving'] { color: #d97706; }
      .status-bar-save[data-state='saved'] { color: #059669; }
      .status-bar-save[data-state='error'] { color: #dc2626; }
      /* Zoom controls — segmented pill at the right of the status bar.
         Visually quieter than the toolbar buttons because it's a
         passive readout that just happens to be clickable. */
      .zoom-controls {
        display: inline-flex;
        align-items: center;
        gap: 0;
        background: #f3f4f6;
        border-radius: 4px;
        padding: 1px;
      }
      .zoom-btn {
        background: transparent;
        border: 0;
        padding: 0 8px;
        height: 22px;
        min-width: 28px;
        font-family: inherit;
        font-size: 0.75rem;
        color: #4b5563;
        cursor: pointer;
        border-radius: 3px;
        transition: background 120ms ease, color 120ms ease;
      }
      .zoom-btn:hover { background: #ffffff; color: #111827; }
      .zoom-btn:focus-visible { outline: 2px solid #2b6ce5; outline-offset: 1px; }
      .zoom-value {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        color: #1f2937;
      }

      .error { color: #b91c1c; }

      /* ---- Loading state ----
         The editor (like the view) is loaded asynchronously from
         Supabase. Without a visible placeholder, users see a near-white
         page for 100-500ms on a fast network and assume the page is
         broken. Centered card with a subtle pulse so the user sees
         something is happening. */
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
        animation: loading-pulse 1.6s ease-in-out infinite;
      }
      .loading-label {
        margin: 0;
        color: #4b5563;
        font-size: 0.95rem;
        font-weight: 500;
      }
      /* loading-pulse keyframe lives in src/styles.scss (shared) */

      /* ---- Mobile collapse ----
         Drop the sticky chrome, drop the inspector, drop the shadow,
         tighten the page padding. Goal: keep the writing surface
         usable on a phone without forcing the user to scroll past
         the entire ribbon. */
      @media (max-width: 900px) {
        /* MenuBarComponent hides itself via its own media query
           (hosted on the .hide-on-mobile class). The toolbar is the
           only chrome row that still has horizontal overflow on
           narrow screens, so it's the one that scrolls. */
        .chrome-row-ruler { display: none; }
        .workspace { gap: 0; }
        .header-row { flex-wrap: wrap; gap: 0.5rem; }
        .header-actions { flex-wrap: wrap; }
      }
      @media (max-width: 600px) {
        :host { background: #ffffff; padding-bottom: 1rem; }
        .edit { padding: 0.5rem 0.5rem 0; }
        .edit-header { max-width: 100%; padding-bottom: 1rem; }
        .question { font-size: 1.35rem; }
        .chrome {
          max-width: 100%;
          border-radius: 0;
          border-left: 0;
          border-right: 0;
          padding: 0 0.5rem;
        }
        .format-toolbar { height: 48px; }
        .tb-divider { display: none; }
        .editor-frame {
          max-width: 100%;
          box-shadow: none;
          border-radius: 0;
        }
        .editor-host ::ng-deep .ck-editor__editable {
          padding: 16px;
          min-height: 50vh;
        }
        .editor-host ::ng-deep .ck-content div[style*='page-break-after'],
        .editor-host ::ng-deep .ck-content div[style*='page-break-before'] {
          margin: 1rem -16px;
          padding: 1rem 16px;
        }
        .status-bar { padding: 0.4rem 0.85rem; font-size: 0.7rem; }
        .status-bar-left, .status-bar-right { gap: 0.5rem; }
      }
    `,
  ],
})
export class EssayEditComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly essaysSvc = inject(EssaysService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly Editor: any = ClassicEditor;

  readonly editorConfig = {
    plugins: [
      Essentials,
      Paragraph,
      Heading,
      Bold,
      Italic,
      Underline,
      Link,
      List,
      BlockQuote,
      PageBreak,
      Undo,
      Alignment,
      Indent,
      IndentBlock,
      Font,
    ],
    toolbar: [],
    placeholder: 'Start writing your essay…',
    licenseKey: 'GPL',
    fontFamily: {
      options: FONT_FAMILIES.map((f) => f.value),
      supportAllValues: true,
    },
    fontSize: {
      options: FONT_SIZES.map((s) => `${s}pt`),
      supportAllValues: true,
    },
  };

  protected readonly fontFamilies = FONT_FAMILIES;
  protected readonly fontSizes = FONT_SIZES;
  protected readonly rulerTicks = [1, 2, 3, 4, 5, 6, 7];

  readonly essay = signal<Essay | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly saveState = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  readonly liveWordCount = signal(0);
  readonly livePageCount = signal(0);
  readonly activeStates = signal<ActiveStates>(INITIAL_ACTIVE);

  // Toggled from View > Show Ruler / Show Status Bar. Default to the
  // values that match the current rendered chrome.
  readonly showRuler = signal(true);
  readonly showStatusBar = signal(true);

  readonly lastSavedAt = signal<Date | null>(null);
  // Cursor position for the status bar. CKEditor 5's selection model
  // exposes the position as a path array; line = block index + 1, column
  // = offset within the block + 1. Updated on selection change in
  // onReady.
  readonly selection = signal<{ line: number; column: number }>({
    line: 1,
    column: 1,
  });

  protected readonly editorReady = signal(false);
  private readonly loaded = signal(false);
  private readonly canSave = computed(
    () => this.editorReady() && this.loaded(),
  );
  private readonly saveQueue$ = new Subject<{ html: string; json: unknown }>();
  private readonly retryCount = signal(0);
  protected readonly saveError = signal<string | null>(null);
  protected readonly statusError = signal<string | null>(null);
  private editorInstance: any = null;

  readonly saveLabel = computed(() => {
    switch (this.saveState()) {
      case 'saving':
        return 'Saving…';
      case 'saved':
        return 'Saved';
      case 'error': {
        const n = this.retryCount();
        return n > 0
          ? `Save failed (retry ${n}/${MAX_AUTOSAVE_RETRIES})`
          : 'Save failed';
      }
      default:
        return '';
    }
  });

  // "Last saved 2 min ago" style label. Depends on `nowTick` so it
  // recomputes every 30s without us having to mutate `lastSavedAt`.
  readonly relativeSavedLabel = computed(() => {
    const saveLabel = this.saveLabel();
    if (saveLabel) return saveLabel;
    const at = this.lastSavedAt();
    if (!at) return 'Not saved yet';
    // Touch `nowTick` so the computed re-runs on the ticker.
    this.nowTick();
    return `Last saved ${this.formatRelative(at)}`;
  });

  // Maps the current selection's font-family command value back to one
  // of our declared FONT_FAMILIES, so the toolbar select can reflect
  // what the user actually has selected. Falls back to the first
  // declared family.
  readonly fontFamilyValue = computed(() => {
    const current = this.activeStates().fontFamily;
    if (current) return current;
    return this.fontFamilies[0].value;
  });

  readonly fontSizeValue = computed(() => {
    const current = this.activeStates().fontSize;
    return current || this.fontSizes[3]; // default to 12pt
  });

  // Tick signal that drives the relative-time label's freshness. Read
  // by `relativeSavedLabel` so the label recomputes every 30s without
  // having to re-set `lastSavedAt` (the previous pattern was a smell).
  private readonly nowTick = signal(Date.now());

  // Zoom level (%). Applied to the editor host via CSS `zoom`. 50–200
  // is the practical range; the status bar exposes +/- buttons + a
  // reset-to-100 button.
  readonly zoom = signal<number>(100);
  zoomIn(): void {
    this.zoom.update((z) => Math.min(200, z + 10));
  }
  zoomOut(): void {
    this.zoom.update((z) => Math.max(50, z - 10));
  }

  // Menu data. Recomputes when any of the toggleable View items change
  // (showRuler, showStatusBar) so the checkmarks stay
  // in sync with the visible chrome.
  readonly menus = computed<MenuCategory[]>(() =>
    buildEditorMenus({
      showRuler: this.showRuler(),
      showStatusBar: this.showStatusBar(),

    }),
  );

  ngOnInit(): void {
    this.saveQueue$
      .pipe(
        debounceTime(1500),
        filter(() => this.canSave()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ html, json }) => {
        void this.persist(html, json);
      });

    // Tick the relative-time label every 30s by writing to `nowTick`.
    // Cheap; uses the browser scheduler so it doesn't fire while the
    // tab is hidden.
    const tick = setInterval(() => this.nowTick.set(Date.now()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(tick));

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError.set('Missing essay id in URL.');
      return;
    }

    this.essaysSvc
      .get(id)
      .then((e) => {
        this.essay.set(e);
        const html = e.answer_html ?? '';
        this.liveWordCount.set(liveWordCount(html));
        this.livePageCount.set(livePageCount(html));
        this.lastSavedAt.set(new Date(e.updated_at));
        this.loaded.set(true);
      })
      .catch((err: unknown) => {
        this.loadError.set(errorMessage(err));
      });
  }

  onReady(editor: any): void {
    this.editorInstance = editor;
    this.editorReady.set(true);

    const refresh = (): void => {
      const cmd = (name: string): any => editor.commands.get(name);
      const headingValue = cmd('heading')?.value;
      const fontFamilyValue = cmd('fontFamily')?.value;
      const fontSizeValue = cmd('fontSize')?.value;
      const alignmentValue = cmd('alignment')?.value;
      this.activeStates.set({
        bold: !!cmd('bold')?.value,
        italic: !!cmd('italic')?.value,
        underline: !!cmd('underline')?.value,
        bulletedList: !!cmd('bulletedList')?.value,
        numberedList: !!cmd('numberedList')?.value,
        blockQuote: !!cmd('blockQuote')?.value,
        link: typeof cmd('link')?.value === 'string',
        heading:
          headingValue === 'heading1' ||
          headingValue === 'heading2' ||
          headingValue === 'heading3'
            ? headingValue
            : 'paragraph',
        alignment:
          alignmentValue === 'center' ||
          alignmentValue === 'right' ||
          alignmentValue === 'justify'
            ? alignmentValue
            : 'left',
        fontFamily: typeof fontFamilyValue === 'string' ? fontFamilyValue : '',
        fontSize:
          typeof fontSizeValue === 'string'
            ? fontSizeValue.replace(/pt$/, '')
            : '',
        canUndo: !!cmd('undo')?.isEnabled,
        canRedo: !!cmd('redo')?.isEnabled,
      });
    };

    refresh();
    // Track cursor position for the status bar's Ln/Col readout. The
    // selection's first position has a path of [rootIndex, blockIndex,
    // offsetInBlock]; line = blockIndex + 1, column = offsetInBlock + 1.
    const updateCursor = (): void => {
      const firstPos =
        editor.model.document.selection.getFirstPosition();
      if (firstPos) {
        const path = firstPos.path;
        this.selection.set({
          line: (path[1] ?? 0) + 1,
          column: (path[path.length - 1] ?? 0) + 1,
        });
      }
    };
    updateCursor();
    // CKEditor 5 emitters return an off-function; capture them so we
    // can detach when the Angular component is destroyed (the editor
    // itself outlives the component and the listeners would otherwise
    // keep firing into a torn-down signal set).
    const offSelection = editor.model.document.selection.on(
      'change:range',
      refresh,
    );
    const offCursor = editor.model.document.selection.on(
      'change:range',
      updateCursor,
    );
    const offData = editor.model.document.on('change:data', refresh);
    this.destroyRef.onDestroy(() => {
      offSelection();
      offCursor();
      offData();
    });
  }

  onChange(event: ChangeEvent): void {
    const html = event.editor.getData();
    this.liveWordCount.set(liveWordCount(html));
    this.livePageCount.set(livePageCount(html));
    this.saveState.set('idle');
    this.saveQueue$.next({ html, json: null });
  }

  async toggleStatus(): Promise<void> {
    const e = this.essay();
    if (!e) return;
    const next: EssayStatus = e.status === 'finished' ? 'draft' : 'finished';
    try {
      await this.essaysSvc.update(e.id, { status: next });
      this.essay.set({ ...e, status: next });
      this.statusError.set(null);
    } catch (err) {
      console.error(err);
      this.statusError.set(errorMessage(err));
    }
  }

  // File > Delete. Mirrors the view component's `remove()` so the two
  // pages share the same behaviour and the user sees the same flow
  // whether they hit Delete from the editor or the read view.
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
    handleEditorMenuAction(actionId, {
      navigate: (commands) => this.router.navigate(commands as never[]),
      executeCommand: (name, value) => this.executeCommand(name, value),
      toggleRuler: () => this.showRuler.update((v) => !v),
      toggleStatusBar: () => this.showStatusBar.update((v) => !v),
      removeEssay: () => this.remove(),
    });
  }

  setFontFamily(value: string): void {
    const editor = this.editorInstance;
    if (!editor) return;
    editor.execute('fontFamily', { value });
    editor.focus();
  }

  setFontSize(value: string): void {
    const editor = this.editorInstance;
    if (!editor) return;
    editor.execute('fontSize', { value: `${value}pt` });
    editor.focus();
  }

  setFontColor(color: string): void {
    const editor = this.editorInstance;
    if (!editor) return;
    editor.execute('fontColor', { color });
    editor.focus();
  }

  setHighlight(color: string): void {
    const editor = this.editorInstance;
    if (!editor) return;
    editor.execute('fontBackgroundColor', { color });
    editor.focus();
  }

  setAlignment(value: AlignmentValue): void {
    const editor = this.editorInstance;
    if (!editor) return;
    editor.execute('alignment', { value });
    editor.focus();
  }

  executeCommand(name: string, value?: string): void {
    const editor = this.editorInstance;
    if (!editor) return;
    if (name === 'link') {
      const linkUi = editor.plugins.get('LinkUI') as
        | { showUI?: () => void }
        | undefined;
      if (linkUi && typeof linkUi.showUI === 'function') {
        linkUi.showUI();
      } else {
        const current = editor.commands.get('link')?.value;
        const url = window.prompt(
          typeof current === 'string' && current.length > 0
            ? 'Edit URL (leave empty to remove):'
            : 'Enter URL:',
          typeof current === 'string' ? current : '',
        );
        if (url === null) {
          editor.focus();
          return;
        }
        if (url === '') {
          editor.execute('unlink');
        } else {
          editor.execute('link', url);
        }
      }
      editor.focus();
      return;
    }
    if (name === 'heading' && value) {
      editor.execute('heading', { value: value as HeadingValue });
      editor.focus();
      return;
    }
    if (value !== undefined) {
      editor.execute(name, { value });
    } else {
      editor.execute(name);
    }
    editor.focus();
  }

  getSelectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  // Human-friendly relative time. Single past tense unit is enough for
  // a status pill — no need to render "2 days, 3 hours" granularity.
  private formatRelative(at: Date): string {
    const seconds = Math.max(0, Math.floor((Date.now() - at.getTime()) / 1000));
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds} sec ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  private async persist(html: string, json: unknown): Promise<void> {
    const e = this.essay();
    if (!e) return;
    this.saveState.set('saving');
    try {
      await this.essaysSvc.update(e.id, {
        answer_html: html,
        answer_json: json,
      });
      const savedAt = new Date();
      this.saveState.set('saved');
      this.essay.set({
        ...e,
        answer_html: html,
        answer_json: json,
        updated_at: savedAt.toISOString(),
      });
      this.liveWordCount.set(liveWordCount(html));
      this.livePageCount.set(livePageCount(html));
      this.lastSavedAt.set(savedAt);
      this.retryCount.set(0);
      this.saveError.set(null);
    } catch (err) {
      console.error(err);
      this.saveError.set(errorMessage(err));
      if (this.retryCount() >= MAX_AUTOSAVE_RETRIES) {
        this.saveState.set('error');
        return;
      }
      this.retryCount.update((n) => n + 1);
      this.saveState.set('error');
      this.saveQueue$.next({ html, json });
    }
  }
}



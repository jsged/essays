import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';

import { MenuActionId, MenuCategory, MenuItem } from './menu.types';

// Shared dropdown menu bar. The component is intentionally dumb — it
// renders a tree of buttons from a MenuCategory[] and emits the item's
// actionId when clicked. Behaviour, including which actionId routes
// where, lives in the parent (essay-edit / essay-view) so this stays
// reusable across pages.
//
// The right-side of the bar (contextual CTAs like "Mark finished") is
// projected via [right-actions] — that's the part that's per-page and
// doesn't belong in the data model.

@Component({
  selector: 'app-menu-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.hide-on-mobile]': 'hideOnMobile',
  },
  template: `
    <nav class="menu-bar" role="menubar" aria-label="Application menu">
      @for (menu of menus; track menu.id; let i = $index) {
        <div class="menu-wrapper" [class.is-open]="activeMenu() === menu.id">
          <button
            type="button"
            class="menu-item menu-trigger"
            role="menuitem"
            aria-haspopup="menu"
            [attr.aria-expanded]="activeMenu() === menu.id"
            (mousedown)="$event.preventDefault()"
            (click)="toggle(menu.id)"
            (keydown)="onTriggerKeydown($event, menu.id)"
          >{{ menu.label }}</button>
          @if (activeMenu() === menu.id) {
            <div
              class="dropdown"
              [class.dropdown-right]="isRightAligned(i)"
              role="menu"
              (keydown)="onDropdownKeydown($event)"
            >
              @for (item of menu.items; track $index) {
                @if (item.isDivider) {
                  <div class="divider" role="presentation"></div>
                } @else {
                  <button
                    type="button"
                    class="dropdown-item"
                    role="menuitem"
                    [class.checked]="item.checked"
                    [class.is-disabled]="item.disabled"
                    [disabled]="item.disabled"
                    (mousedown)="$event.preventDefault()"
                    (click)="onItemClick(item)"
                  >
                    <span class="check" aria-hidden="true">{{ item.checked ? '✓' : '' }}</span>
                    <span class="label">{{ item.label }}</span>
                    @if (item.shortcut) {
                      <span class="shortcut" aria-hidden="true">{{ item.shortcut }}</span>
                    }
                  </button>
                }
              }
            </div>
          }
        </div>
      }
      <div class="menu-spacer"></div>
      <ng-content select="[right-actions]"></ng-content>
    </nav>
  `,
  styles: [
    `
      /* display: contents on the host so the .menu-bar nav participates
         in the parent's layout — that's what lets position: sticky on
         the nav work without us needing a wrapper at the call site. */
      :host {
        display: contents;
      }
      /* On narrow viewports the menu bar trades for screen space; the
         parent pages can opt out of this with [hideOnMobile]=false. */
      @media (max-width: 900px) {
        :host(.hide-on-mobile) {
          display: none;
        }
      }
      .menu-bar {
        /* Sticky behaviour is owned by the parent's chrome container
           (editor/view wraps the menu bar + toolbar + ruler in one
           sticky section). Keeping position: relative here means
           adding this component into any layout "just works" — the
           parent decides whether it should pin. */
        position: relative;
        display: flex;
        align-items: center;
        gap: 4px;
        height: 40px;
        background: transparent;
        border: 0;
        border-radius: 0;
        padding: 0 6px;
        box-shadow: none;
      }
      .menu-wrapper {
        position: relative;
        height: 100%;
        display: flex;
        align-items: center;
      }
      /* Explicit border: 0 / border-radius / background overrides the
         global "nav button" rule in app.scss (which adds a 1px gray
         border + 4px radius to every button inside any <nav>, including
         this menu bar's own <nav>). Without this override the triggers
         render as HTML-style bordered buttons, not the Google-Docs-style
         text+hover-fill the design wants. */
      .menu-trigger {
        height: 32px;
        padding: 0 10px;
        font-size: 0.85rem;
        font-weight: 500;
        background: transparent;
        border: 0;
        border-radius: 6px;
        color: #1f2937;
        cursor: pointer;
        font-family: inherit;
        transition: background 150ms ease-out, color 150ms ease-out;
      }
      .menu-trigger:hover {
        background: #eef4ff;
        color: #2b6ce5;
      }
      .menu-trigger.is-open,
      .menu-trigger[aria-expanded='true'] {
        background: #eef4ff;
        color: #2b6ce5;
      }

      /* Dropdown panel — fixed 220px wide, shadow, anchored under trigger. */
      .dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 4px;
        min-width: 220px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        box-shadow:
          0 4px 6px rgba(0, 0, 0, 0.05),
          0 12px 24px rgba(0, 0, 0, 0.1);
        padding: 4px;
        z-index: 20;
        max-height: 70vh;
        overflow-y: auto;
      }
      /* Tools and Help (rightmost two) flip to the right edge so the
         dropdown doesn't overflow the viewport. The threshold is
         computed in the component (isRightAligned) so the rule stays
         a single declaration. */
      .dropdown-right {
        left: auto;
        right: 0;
      }

      .dropdown-item {
        all: unset;
        display: grid;
        grid-template-columns: 18px 1fr auto;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 10px;
        border-radius: 4px;
        font-size: 0.85rem;
        color: #1f2937;
        cursor: pointer;
        box-sizing: border-box;
      }
      .dropdown-item:hover:not(.is-disabled),
      .dropdown-item:focus-visible:not(.is-disabled) {
        background: #eef4ff;
        color: #2b6ce5;
      }
      .dropdown-item.checked {
        font-weight: 500;
      }
      .dropdown-item.is-disabled {
        color: #9ca3af;
        cursor: not-allowed;
      }
      .check {
        font-size: 0.8rem;
        color: #2b6ce5;
        text-align: center;
      }
      .shortcut {
        font-size: 0.75rem;
        color: #9ca3af;
        font-variant-numeric: tabular-nums;
      }
      .divider {
        height: 1px;
        background: #f3f4f6;
        margin: 4px 6px;
      }
    `,
  ],
})
export class MenuBarComponent {
  // Required input — the component is data-driven. The parent owns the
  // menu shape (and rebuilds it when toggleable state changes). Typed
  // as `readonly` so the view's static `readonly MenuCategory[]` can
  // bind to it without a covariance complaint.
  @Input({ required: true }) menus: readonly MenuCategory[] = [];

  /** Hides the menu bar below the 900px breakpoint. Default `true`. */
  @Input() hideOnMobile = true;

  @Output() readonly action = new EventEmitter<MenuActionId>();

  readonly activeMenu = signal<string | null>(null);

  // Host listener so we can attach the click-outside detector to the
  // document without needing the parent to wire anything. Typed via
  // the field annotation because `inject()` doesn't accept type args
  // directly — `inject<ElementRef<HTMLElement>>(ElementRef)` would
  // fail TS2347.
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (this.activeMenu() === null) return;
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.activeMenu.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.activeMenu() !== null) {
      this.activeMenu.set(null);
    }
  }

  toggle(id: string): void {
    this.activeMenu.update((current) => (current === id ? null : id));
  }

  onItemClick(item: MenuItem): void {
    if (item.disabled || item.isDivider) return;
    if (item.actionId) this.action.emit(item.actionId);
    this.activeMenu.set(null);
  }

  // Right-align the rightmost ~30% of categories. Scales with menu
  // length so a 7-category menu flips Tools + Help, a 5-category menu
  // flips the last 2, and a 2-category menu flips just the last one.
  // Hard threshold of "last 2" breaks for short menus (File + Help
  // would both right-align on the view, which looks odd).
  isRightAligned(index: number): boolean {
    const flipFrom = Math.max(1, Math.ceil(this.menus.length * 0.7));
    return index >= flipFrom;
  }

  onTriggerKeydown(event: KeyboardEvent, id: string): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.activeMenu.set(id);
      // Focus the first non-disabled item once the dropdown renders.
      queueMicrotask(() => {
        const first = this.host.nativeElement.querySelector<HTMLButtonElement>(
          '.dropdown .dropdown-item:not(.is-disabled)',
        );
        first?.focus();
      });
    } else if (event.key === 'Escape') {
      this.activeMenu.set(null);
    }
  }

  onDropdownKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.activeMenu.set(null);
      // Return focus to the trigger so keyboard users keep their place.
      const trigger = this.host.nativeElement.querySelector<HTMLButtonElement>(
        '.menu-wrapper.is-open .menu-trigger',
      );
      trigger?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = Array.from(
        this.host.nativeElement.querySelectorAll<HTMLButtonElement>(
          '.dropdown .dropdown-item',
        ),
      );
      const current = document.activeElement as HTMLElement | null;
      const idx = current ? items.indexOf(current as HTMLButtonElement) : -1;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const next = items[(idx + direction + items.length) % items.length];
      next?.focus();
    }
  }
}

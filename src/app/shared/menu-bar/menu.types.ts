// Menu item contract for the shared MenuBarComponent. Items are pure
// data — actions travel back to the parent as string IDs so the menu
// component doesn't capture callback closures (which would be a stale-
// closure trap the moment the parent re-renders the menu config).

export type MenuActionId =
  // File
  | 'file:new' | 'file:open' | 'file:duplicate' | 'file:rename'
  | 'file:move' | 'file:export' | 'file:download-pdf'
  | 'file:download-docx' | 'file:print' | 'file:delete'
  // Edit
  | 'edit:undo' | 'edit:redo' | 'edit:cut' | 'edit:copy'
  | 'edit:paste' | 'edit:paste-plain' | 'edit:select-all'
  | 'edit:find' | 'edit:replace'
  // View
  | 'view:ruler' | 'view:status-bar' | 'view:sidebar'
  | 'view:zoom' | 'view:dark-mode' | 'view:focus-mode'
  | 'view:word-wrap'
  // Insert
  | 'insert:image' | 'insert:table' | 'insert:horizontal-line'
  | 'insert:footnote' | 'insert:comment' | 'insert:equation'
  | 'insert:special-character' | 'insert:page-break'
  | 'insert:page-number' | 'insert:header' | 'insert:footer'
  | 'insert:link'
  // Format
  | 'format:bold' | 'format:italic' | 'format:underline'
  | 'format:strikethrough' | 'format:superscript'
  | 'format:subscript' | 'format:paragraph' | 'format:line-spacing'
  | 'format:columns' | 'format:margins'
  // Tools
  | 'tools:spell-check' | 'tools:grammar' | 'tools:word-count'
  | 'tools:ai' | 'tools:stats' | 'tools:accessibility'
  // Help
  | 'help:shortcuts' | 'help:tutorial' | 'help:docs'
  | 'help:report-bug' | 'help:about';

export interface MenuItem {
  /** Visible label. Omit for dividers. */
  label?: string;
  /** Identifier emitted to the parent on click. Omit for dividers. */
  actionId?: MenuActionId;
  /** Renders the item greyed-out and prevents the action from firing. */
  disabled?: boolean;
  /** Marks the item with a checkmark — used for view toggles. */
  checked?: boolean;
  /** Optional keyboard hint (e.g. "Ctrl+Z"). Not interactive. */
  shortcut?: string;
  /** When true, renders as a horizontal divider instead of a button. */
  isDivider?: boolean;
}

export interface MenuCategory {
  /** Stable identifier — used to track which dropdown is open. */
  id: string;
  /** Top-level button label (e.g. "File"). */
  label: string;
  items: MenuItem[];
}

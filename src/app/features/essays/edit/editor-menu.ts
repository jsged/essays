import { MenuCategory, MenuItem } from '../../../shared/menu-bar/menu.types';

// State the View category needs to reflect in its checkmarks. Driven
// from the parent so the menu can be rebuilt reactively when toggles
// change.
export interface EditorMenuState {
  showRuler: boolean;
  showStatusBar: boolean;
}

// All non-View categories are static. They're declared `as const` so
// the bundler treats them as immutable data and the type narrows the
// actionId literals.
const FILE_ITEMS: readonly MenuItem[] = [
  { label: 'New', actionId: 'file:new' },
  { label: 'Open', actionId: 'file:open', disabled: true },
  { isDivider: true },
  { label: 'Duplicate', actionId: 'file:duplicate', disabled: true },
  { label: 'Rename', actionId: 'file:rename', disabled: true },
  { label: 'Move', actionId: 'file:move', disabled: true },
  { isDivider: true },
  { label: 'Export', actionId: 'file:export', disabled: true },
  { label: 'Download PDF', actionId: 'file:download-pdf', disabled: true },
  { label: 'Download DOCX', actionId: 'file:download-docx', disabled: true },
  { label: 'Print', actionId: 'file:print' },
  { isDivider: true },
  { label: 'Delete', actionId: 'file:delete' },
] as const;

const EDIT_ITEMS: readonly MenuItem[] = [
  { label: 'Undo', actionId: 'edit:undo', shortcut: 'Ctrl+Z' },
  { label: 'Redo', actionId: 'edit:redo', shortcut: 'Ctrl+Shift+Z' },
  { isDivider: true },
  { label: 'Cut', actionId: 'edit:cut', shortcut: 'Ctrl+X', disabled: true },
  { label: 'Copy', actionId: 'edit:copy', shortcut: 'Ctrl+C', disabled: true },
  { label: 'Paste', actionId: 'edit:paste', shortcut: 'Ctrl+V', disabled: true },
  {
    label: 'Paste Without Formatting',
    actionId: 'edit:paste-plain',
    shortcut: 'Ctrl+Shift+V',
    disabled: true,
  },
  { isDivider: true },
  { label: 'Select All', actionId: 'edit:select-all', shortcut: 'Ctrl+A', disabled: true },
  { isDivider: true },
  { label: 'Find', actionId: 'edit:find', shortcut: 'Ctrl+F', disabled: true },
  { label: 'Replace', actionId: 'edit:replace', shortcut: 'Ctrl+H', disabled: true },
] as const;

// View items whose `checked` state is dynamic — declared without the
// field and stamped with the live values at build time.
const VIEW_ITEMS: readonly MenuItem[] = [
  { label: 'Show Ruler', actionId: 'view:ruler' },
  { label: 'Show Status Bar', actionId: 'view:status-bar' },

  { isDivider: true },
  { label: 'Zoom', actionId: 'view:zoom', disabled: true },
  { label: 'Dark Mode', actionId: 'view:dark-mode', disabled: true },
  { label: 'Focus Mode', actionId: 'view:focus-mode', disabled: true },
  { label: 'Word Wrap', actionId: 'view:word-wrap', disabled: true },
] as const;

const INSERT_ITEMS: readonly MenuItem[] = [
  { label: 'Image', actionId: 'insert:image', disabled: true },
  { label: 'Table', actionId: 'insert:table', disabled: true },
  { label: 'Horizontal Line', actionId: 'insert:horizontal-line', disabled: true },
  { isDivider: true },
  { label: 'Footnote', actionId: 'insert:footnote', disabled: true },
  { label: 'Comment', actionId: 'insert:comment', disabled: true },
  { label: 'Equation', actionId: 'insert:equation', disabled: true },
  { label: 'Special Character', actionId: 'insert:special-character', disabled: true },
  { isDivider: true },
  { label: 'Page Break', actionId: 'insert:page-break' },
  { label: 'Page Number', actionId: 'insert:page-number', disabled: true },
  { label: 'Header', actionId: 'insert:header', disabled: true },
  { label: 'Footer', actionId: 'insert:footer', disabled: true },
  { isDivider: true },
  { label: 'Link', actionId: 'insert:link', shortcut: 'Ctrl+K' },
] as const;

const FORMAT_ITEMS: readonly MenuItem[] = [
  { label: 'Bold', actionId: 'format:bold', shortcut: 'Ctrl+B' },
  { label: 'Italic', actionId: 'format:italic', shortcut: 'Ctrl+I' },
  { label: 'Underline', actionId: 'format:underline', shortcut: 'Ctrl+U' },
  { isDivider: true },
  { label: 'Strikethrough', actionId: 'format:strikethrough', disabled: true },
  { label: 'Superscript', actionId: 'format:superscript', disabled: true },
  { label: 'Subscript', actionId: 'format:subscript', disabled: true },
  { isDivider: true },
  { label: 'Paragraph', actionId: 'format:paragraph' },
  { label: 'Line Spacing', actionId: 'format:line-spacing', disabled: true },
  { label: 'Columns', actionId: 'format:columns', disabled: true },
  { label: 'Margins', actionId: 'format:margins', disabled: true },
] as const;

const TOOLS_ITEMS: readonly MenuItem[] = [
  { label: 'Spell Check', actionId: 'tools:spell-check', disabled: true },
  { label: 'Grammar', actionId: 'tools:grammar', disabled: true },
  { isDivider: true },
  { label: 'Word Count', actionId: 'tools:word-count', disabled: true },
  { label: 'AI Assistant', actionId: 'tools:ai', disabled: true },
  { label: 'Document Statistics', actionId: 'tools:stats', disabled: true },
  { label: 'Accessibility Checker', actionId: 'tools:accessibility', disabled: true },
] as const;

const HELP_ITEMS: readonly MenuItem[] = [
  { label: 'Keyboard Shortcuts', actionId: 'help:shortcuts', shortcut: 'Ctrl+/' },
  { label: 'Tutorial', actionId: 'help:tutorial' },
  { label: 'Documentation', actionId: 'help:docs' },
  { isDivider: true },
  { label: 'Report Bug', actionId: 'help:report-bug' },
  { label: 'About', actionId: 'help:about' },
] as const;

// Build the menu categories array with the current View state baked in.
// Called from a `computed` so the result recomputes when any of the
// toggle signals change.
export function buildEditorMenus(state: EditorMenuState): MenuCategory[] {
  // Stamp the View items with the live checkmark values. The source
  // VIEW_ITEMS array is readonly; we map to a fresh array so we don't
  // mutate module-level state.
  const viewItems: MenuItem[] = VIEW_ITEMS.map((item) => {
    if (item.actionId === 'view:ruler') return { ...item, checked: state.showRuler };
    if (item.actionId === 'view:status-bar') return { ...item, checked: state.showStatusBar };
    return item;
  });
  return [
    { id: 'file', label: 'File', items: [...FILE_ITEMS] },
    { id: 'edit', label: 'Edit', items: [...EDIT_ITEMS] },
    { id: 'view', label: 'View', items: viewItems },
    { id: 'insert', label: 'Insert', items: [...INSERT_ITEMS] },
    { id: 'format', label: 'Format', items: [...FORMAT_ITEMS] },
    { id: 'tools', label: 'Tools', items: [...TOOLS_ITEMS] },
    { id: 'help', label: 'Help', items: [...HELP_ITEMS] },
  ];
}

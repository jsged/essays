import { MenuActionId } from '../../../shared/menu-bar/menu.types';

// Minimal context the action handler needs from the component. We
// accept a narrow interface (not the full component class) so the
// handler stays decoupled and testable.
export interface EditorMenuActionContext {
  /** Navigate to a new route. */
  navigate: (commands: string[]) => Promise<unknown>;
  /** Trigger the editor's named command. */
  executeCommand: (name: string, value?: string) => void;
  /** Toggle the View > Show Ruler state. */
  toggleRuler: () => void;
  /** Toggle the View > Show Status Bar state. */
  toggleStatusBar: () => void;
  /** Delete the current essay and return to the dashboard. */
  removeEssay: () => Promise<void>;
}

// Single dispatch point. Kept in its own file so the editor component
// stays under the 8kB style budget. Items we can't support yet route
// to a graceful no-op + `console.info` so the user knows the feature
// is recognised but unimplemented (no silently-dead UI).
export function handleEditorMenuAction(
  actionId: MenuActionId,
  ctx: EditorMenuActionContext,
): void {
  switch (actionId) {
    // File
    case 'file:new':
      void ctx.navigate(['/app/new']);
      return;
    case 'file:print':
      window.print();
      return;
    case 'file:delete':
      void ctx.removeEssay();
      return;
    case 'file:open':
    case 'file:duplicate':
    case 'file:rename':
    case 'file:move':
    case 'file:export':
    case 'file:download-pdf':
    case 'file:download-docx':
      infoComingSoon(actionId);
      return;

    // Edit
    case 'edit:undo':
      ctx.executeCommand('undo');
      return;
    case 'edit:redo':
      ctx.executeCommand('redo');
      return;
    case 'edit:cut':
    case 'edit:copy':
    case 'edit:paste':
    case 'edit:paste-plain':
    case 'edit:select-all':
    case 'edit:find':
    case 'edit:replace':
      infoComingSoon(actionId);
      return;

    // View
    case 'view:ruler':
      ctx.toggleRuler();
      return;
    case 'view:status-bar':
      ctx.toggleStatusBar();
      return;
    case 'view:zoom':
    case 'view:dark-mode':
    case 'view:focus-mode':
    case 'view:word-wrap':
      infoComingSoon(actionId);
      return;

    // Insert
    case 'insert:page-break':
      ctx.executeCommand('pageBreak');
      return;
    case 'insert:link':
      ctx.executeCommand('link');
      return;
    case 'insert:image':
    case 'insert:table':
    case 'insert:horizontal-line':
    case 'insert:footnote':
    case 'insert:comment':
    case 'insert:equation':
    case 'insert:special-character':
    case 'insert:page-number':
    case 'insert:header':
    case 'insert:footer':
      infoComingSoon(actionId);
      return;

    // Format
    case 'format:bold':
      ctx.executeCommand('bold');
      return;
    case 'format:italic':
      ctx.executeCommand('italic');
      return;
    case 'format:underline':
      ctx.executeCommand('underline');
      return;
    case 'format:paragraph':
      ctx.executeCommand('heading', 'paragraph');
      return;
    case 'format:strikethrough':
    case 'format:superscript':
    case 'format:subscript':
    case 'format:line-spacing':
    case 'format:columns':
    case 'format:margins':
      infoComingSoon(actionId);
      return;

    // Tools
    case 'tools:word-count':
    case 'tools:stats':
    case 'tools:ai':
      infoComingSoon(actionId);
      return;
    case 'tools:spell-check':
    case 'tools:grammar':
    case 'tools:accessibility':
      infoComingSoon(actionId);
      return;

    // Help
    case 'help:shortcuts':
      window.alert(
        'Keyboard shortcuts:\n\n' +
          'Ctrl+B   Bold\n' +
          'Ctrl+I   Italic\n' +
          'Ctrl+U   Underline\n' +
          'Ctrl+K   Insert link\n' +
          'Ctrl+Z   Undo\n' +
          'Ctrl+Shift+Z   Redo\n' +
          'Esc      Close menu',
      );
      return;
    case 'help:about':
      window.alert('EssaysApp\n\nA focused writing environment for your essays.');
      return;
    case 'help:tutorial':
    case 'help:docs':
    case 'help:report-bug':
      infoComingSoon(actionId);
      return;
  }
}

function infoComingSoon(actionId: string): void {
  // Surfacing the action ID to the console helps the next dev figure
  // out what's wired vs. stubbed without forcing a UI dialog for every
  // unhandled item.
  console.info(`[menu] ${actionId} is not yet implemented.`);
}

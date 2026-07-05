import { inject, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
// `dompurify`'s default export is the callable `sanitize(dirty, cfg)`
// function, but `@types/dompurify@3.0.5` (which the project pins) types
// it as a `DOMPurify` object — the type is stale relative to
// `dompurify@3.4.x` and the call signature is wrong. Casting through
// `unknown` to the real runtime signature avoids both the type error
// and the runtime failure that was producing the blank view page.
import DOMPurify from 'dompurify';

type Sanitize = (dirty: string, cfg?: Record<string, unknown>) => string;
const sanitize = DOMPurify as unknown as Sanitize;

// Sanitize editor HTML through DOMPurify, then mark the result as safe so
// [innerHTML] will render it. Use this for any essay content that came out
// of CKEditor before displaying it.
@Pipe({ name: 'safeHtml', standalone: true })
export class SafeHtmlPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';
    const cleaned = sanitize(value, {
      USE_PROFILES: { html: true },
    });
    return this.sanitizer.bypassSecurityTrustHtml(cleaned);
  }
}

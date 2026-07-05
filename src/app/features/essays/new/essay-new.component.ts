import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { errorMessage } from '../../../core/error-message';
import { EssaysService } from '../../../core/essays.service';

@Component({
  selector: 'app-essay-new',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="new">
      <h1>New essay</h1>
      <p class="muted">Capture the question, then write your answer on the next page.</p>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label>
          Question
          <textarea
            formControlName="question"
            rows="3"
            placeholder="e.g. What does it mean to live a good life?"
            required
          ></textarea>
        </label>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <div class="actions">
          <button type="submit" [disabled]="form.invalid || submitting()">
            {{ submitting() ? 'Creating…' : 'Create draft' }}
          </button>
        </div>
      </form>
    </section>
  `,
  styles: [`
    .new { max-width: 640px; margin: 2rem auto; padding: 1rem; }
    h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }
    .muted { color: #6b7280; margin: 0 0 1rem; }
    form { display: flex; flex-direction: column; gap: 0.75rem; }
    label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; color: #4b5563; }
    textarea {
      padding: 0.65rem 0.75rem; border: 1px solid #d1d5db; border-radius: 6px;
      font-size: 1rem; font-family: inherit; line-height: 1.4; resize: vertical;
    }
    textarea:focus { outline: 2px solid #6366f1; outline-offset: 1px; border-color: transparent; }
    .actions { display: flex; justify-content: flex-end; }
    button {
      padding: 0.6rem 1.1rem; background: #1f2937; color: white; border: 0;
      border-radius: 6px; font-size: 1rem; cursor: pointer;
    }
    button:disabled { opacity: 0.55; cursor: progress; }
    .error { color: #b91c1c; margin: 0; }
  `],
})
export class EssayNewComponent {
  private readonly fb = inject(FormBuilder);
  private readonly essays = inject(EssaysService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    question: ['', [Validators.required, Validators.minLength(3)]],
  });
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const { question } = this.form.getRawValue();
      const created = await this.essays.create({ question });
      await this.router.navigate(['/app/edit', created.id]);
    } catch (err) {
      this.error.set(errorMessage(err));
      this.submitting.set(false);
    }
  }
}

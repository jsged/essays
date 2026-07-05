import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { errorMessage } from '../../core/error-message';
import { AuthService } from '../../core/auth.service';

const PLACEHOLDER_ERROR = 'Please correct the highlighted fields.';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth">
      <h1>Sign in</h1>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label>
          Email
          <input
            #emailInput
            type="email"
            formControlName="email"
            autocomplete="email"
            spellcheck="false"
            required
            [attr.aria-invalid]="ariaInvalid(form.controls.email) || null"
          />
          @if (
            form.controls.email.touched && form.controls.email.errors?.['required']
          ) {
            <p class="field-error">Email is required.</p>
          } @else if (
            form.controls.email.touched && form.controls.email.errors?.['email']
          ) {
            <p class="field-error">Enter a valid email address.</p>
          }
        </label>
        <label>
          Password
          <input
            #passwordInput
            type="password"
            formControlName="password"
            autocomplete="current-password"
            required
            [attr.aria-invalid]="ariaInvalid(form.controls.password) || null"
          />
          @if (
            form.controls.password.touched
            && form.controls.password.errors?.['required']
          ) {
            <p class="field-error">Password is required.</p>
          } @else if (
            form.controls.password.touched
            && form.controls.password.errors?.['minlength']
          ) {
            <p class="field-error">At least 6 characters.</p>
          }
        </label>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" [disabled]="submitting()">
          {{ submitting() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
      <p class="alt">
        No account? <a routerLink="/signup">Create one</a>.
      </p>
    </section>
  `,
  styles: [`
    .auth {
      max-width: 22rem;
      margin: 4rem auto;
      padding: 1.5rem 1.5rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    h1 { margin: 0; font-size: 1.5rem; }
    form { display: flex; flex-direction: column; gap: 0.75rem; }
    label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; color: #4b5563; }
    input {
      padding: 0.55rem 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 1rem;
      font-family: inherit;
    }
    input:focus { outline: 2px solid #6366f1; outline-offset: 1px; border-color: transparent; }
    input[aria-invalid="true"] { border-color: #b91c1c; }
    .field-error { color: #b91c1c; font-size: 0.75rem; margin: 0.15rem 0 0; }
    button {
      margin-top: 0.25rem;
      padding: 0.65rem;
      background: #1f2937;
      color: white;
      border: 0;
      border-radius: 6px;
      font-size: 1rem;
      cursor: pointer;
    }
    button:disabled { opacity: 0.55; cursor: progress; }
    .error { color: #b91c1c; font-size: 0.875rem; margin: 0; }
    .alt { color: #6b7280; font-size: 0.875rem; margin: 0; }
    .alt a { color: #4f46e5; }
  `],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');
  readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');

  constructor() {
    // When the user fixes the form, the placeholder "Please correct the
    // highlighted fields." banner should disappear. We only clear that
    // specific message — real Supabase errors stay until the next submit.
    this.form.statusChanges
      .pipe(takeUntilDestroyed())
      .subscribe((status) => {
        if (status === 'VALID' && this.error() === PLACEHOLDER_ERROR) {
          this.error.set(null);
        }
      });
  }

  async submit(): Promise<void> {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      this.error.set(PLACEHOLDER_ERROR);
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    let ok = false;
    try {
      const { email, password } = this.form.getRawValue();
      const { error } = await this.auth.signIn(email, password);
      if (error) {
        this.error.set(error.message);
        this.focusFirstInvalid();
      } else {
        ok = true;
      }
    } catch (e: unknown) {
      this.error.set(`Could not reach the server: ${errorMessage(e)}`);
      this.focusFirstInvalid();
    } finally {
      this.submitting.set(false);
    }
    if (ok) {
      await this.router.navigate(['/app']);
    }
  }

  protected ariaInvalid(control: AbstractControl): boolean {
    return !!(control.touched && control.invalid);
  }

  private focusFirstInvalid(): void {
    if (this.form.controls.email.invalid) {
      this.emailInput()?.nativeElement.focus();
    } else if (this.form.controls.password.invalid) {
      this.passwordInput()?.nativeElement.focus();
    }
  }
}

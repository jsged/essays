import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { errorMessage } from '../../core/error-message';
import { AuthService } from '../../core/auth.service';

const PLACEHOLDER_ERROR = 'Please correct the highlighted fields.';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const pwd = group.get('password')?.value as string | undefined;
  const confirm = group.get('confirm')?.value as string | undefined;
  return pwd && confirm && pwd !== confirm ? { mismatch: true } : null;
}

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth">
      <h1>Create account</h1>
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
            autocomplete="new-password"
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
        <label>
          Confirm password
          <input
            #confirmInput
            type="password"
            formControlName="confirm"
            autocomplete="new-password"
            required
            [attr.aria-invalid]="ariaInvalid(form.controls.confirm) || null"
          />
          @if (
            form.controls.confirm.touched
            && form.controls.confirm.errors?.['required']
          ) {
            <p class="field-error">Please retype your password.</p>
          } @else if (
            form.hasError('mismatch')
            && (form.controls.password.touched || form.controls.confirm.touched)
          ) {
            <p class="field-error">Passwords do not match.</p>
          }
        </label>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" [disabled]="submitting()">
          {{ submitting() ? 'Creating…' : 'Create account' }}
        </button>
      </form>
      <p class="alt">
        Already have one? <a routerLink="/login">Sign in</a>.
      </p>
    </section>
  `,
  styles: [`
    .auth { max-width: 22rem; margin: 4rem auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
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
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirm: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');
  readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');
  readonly confirmInput = viewChild<ElementRef<HTMLInputElement>>('confirmInput');

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
      const { error } = await this.auth.signUp(email, password);
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
    if (control.touched && control.invalid) return true;
    // Group-level mismatch: mark confirm as invalid once either match input
    // has been touched, since that's where the user needs to focus next.
    if (
      control === this.form.controls.confirm
      && this.form.hasError('mismatch')
      && (this.form.controls.password.touched || this.form.controls.confirm.touched)
    ) {
      return true;
    }
    return false;
  }

  private focusFirstInvalid(): void {
    if (this.form.controls.email.invalid) {
      this.emailInput()?.nativeElement.focus();
    } else if (this.form.controls.password.invalid) {
      this.passwordInput()?.nativeElement.focus();
    } else if (
      this.form.hasError('mismatch')
      || this.form.controls.confirm.invalid
    ) {
      this.confirmInput()?.nativeElement.focus();
    }
  }
}

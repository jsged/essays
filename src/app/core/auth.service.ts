import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthError, Session, User } from '@supabase/supabase-js';

import { SupabaseService } from './supabase.service';

// Wraps Supabase Auth as Angular signals so the rest of the app can react
// with `auth.isAuthenticated()`, etc.
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly router = inject(Router);

  readonly session = signal<Session | null>(null);
  readonly user = signal<User | null>(null);
  readonly loading = signal<boolean>(true);
  readonly isAuthenticated = computed<boolean>(() => this.user() !== null);

  constructor() {
    // Hydrate the session once at boot. `.finally` guarantees we clear the
    // loading signal even if `getSession()` itself rejects (network down,
    // ad-blocker, etc.) — otherwise the app sits on the splash forever.
    void this.supabase.auth
      .getSession()
      .then(({ data }) => {
        this.session.set(data.session);
        this.user.set(data.session?.user ?? null);
      })
      .catch(() => {
        /* session unavailable — leave the user anonymous */
      })
      .finally(() => this.loading.set(false));

    // Stay in sync with future auth events (sign-in, sign-out, token refresh).
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      this.user.set(session?.user ?? null);
      this.loading.set(false);
    });
  }

  async signUp(
    email: string,
    password: string,
  ): Promise<{ error: AuthError | null }> {
    const { error } = await this.supabase.auth.signUp({ email, password });
    return { error };
  }

  async signIn(
    email: string,
    password: string,
  ): Promise<{ error: AuthError | null }> {
    const { error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    await this.router.navigate(['/login']);
  }
}

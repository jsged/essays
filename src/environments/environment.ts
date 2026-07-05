// Development environment.
// Replace `supabaseUrl` and `supabaseAnonKey` with the values from your
// Supabase project's API settings page:
//   https://app.supabase.com/project/_/settings/api
//
// The anon key is safe to ship in the bundle — Supabase Row Level Security
// (RLS) is what protects user data, not the secrecy of this key.

import { Environment } from './environment.types';

export const environment: Environment = {
  production: false,
  supabaseUrl: 'https://rqbvshaobetkraatqzqd.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxYnZzaGFvYmV0a3JhYXRxenFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTYxNTQsImV4cCI6MjA5ODc3MjE1NH0.VKzUtsnM5XXKbaGuxiuGkuvPWXhsePhY6wVcE5G1Bik',
};

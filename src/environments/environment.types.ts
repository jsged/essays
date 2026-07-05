// Shape of the `environment` object exported by `environment.ts` and
// `environment.prod.ts`. Keep the two files in lock-step with this interface.
export interface Environment {
  production: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

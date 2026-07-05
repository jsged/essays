// Production environment.
// `angular.json` swaps this file in for `environment.ts` when building
// with `--configuration=production` via the `fileReplacements` block.
//
// Replace the placeholders below with your production Supabase project's
// URL and anon key from:
//   https://app.supabase.com/project/_/settings/api

import { Environment } from './environment.types';

export const environment: Environment = {
  production: true,
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabaseAnonKey: 'YOUR_PRODUCTION_SUPABASE_ANON_KEY',
};

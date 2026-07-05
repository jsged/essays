import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../environments/environment';

// Single Supabase client for the whole app.
// `environment.supabaseUrl` / `environment.supabaseAnonKey` come from
// `src/environments/environment.ts`, which `angular.json` swaps for
// `environment.prod.ts` when building with `--configuration=production`.
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    },
  );
}

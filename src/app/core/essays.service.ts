import { Injectable, inject } from '@angular/core';

import { Essay, EssayInsert, EssayUpdate } from './essay.model';
import { SupabaseService } from './supabase.service';

// Wraps CRUD on the `essays` table.
// RLS policies defined in dev/PLAN.md §4 enforce that each user can only
// see/modify their own rows, so we never set `user_id` from the client —
// the `auth.uid()` claim on the session is used implicitly by Postgres.
@Injectable({ providedIn: 'root' })
export class EssaysService {
  private readonly supabase = inject(SupabaseService).client;

  async list(): Promise<Essay[]> {
    const { data, error } = await this.supabase
      .from('essays')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Essay[];
  }

  async get(id: string): Promise<Essay> {
    const { data, error } = await this.supabase
      .from('essays')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as Essay;
  }

  async create(input: EssayInsert): Promise<Essay> {
    const { data, error } = await this.supabase
      .from('essays')
      .insert({ status: 'draft', ...input })
      .select()
      .single();
    if (error) throw error;
    return data as Essay;
  }

  async update(id: string, patch: EssayUpdate): Promise<void> {
    const { error } = await this.supabase
      .from('essays')
      .update(patch)
      .eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('essays')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { errorMessage } from '../../../core/error-message';
import { Essay, EssayStatus } from '../../../core/essay.model';
import { EssaysService } from '../../../core/essays.service';

@Component({
  selector: 'app-essay-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink],
  template: `
    <section class="dash">
      <header class="dash-header">
        <h1>Your essays</h1>
        <a routerLink="/app/new" class="primary">+ New essay</a>
      </header>

      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      } @else if (essays().length === 0) {
        <div class="empty">
          <p>No essays yet.</p>
          <a routerLink="/app/new" class="primary">Write your first one</a>
        </div>
      } @else {
        <ul class="cards">
          @for (g of grouped(); track g.status) {
            @if (g.items.length > 0) {
              <li class="group">
                <h2>{{ g.status === 'draft' ? 'Drafts' : 'Finished' }}</h2>
                <ul class="cards">
                  @for (e of g.items; track e.id) {
                    <li class="card">
                      <a [routerLink]="['/app/view', e.id]" class="card-q">
                        {{ e.question }}
                      </a>
                      <div class="meta">
                        <a [routerLink]="['/app/edit', e.id]">Edit</a>
                        <span class="muted">
                          Updated {{ e.updated_at | date: 'short' }}
                        </span>
                        @if (e.word_count !== null) {
                          <span class="muted">· {{ e.word_count }} words</span>
                        }
                        @if (e.page_count !== null && e.page_count > 0) {
                          <span class="muted">· {{ e.page_count }} {{ e.page_count === 1 ? 'page' : 'pages' }}</span>
                        }
                      </div>
                    </li>
                  }
                </ul>
              </li>
            }
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    .dash { max-width: 880px; margin: 0 auto; padding: 1.5rem 1rem; }
    .dash-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
    h1 { margin: 0; font-size: 1.75rem; }
    h2 { font-size: 0.75rem; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin: 1.5rem 0 0.5rem; }
    .primary {
      background: #1f2937; color: white; padding: 0.5rem 0.9rem; border-radius: 6px;
      text-decoration: none; font-weight: 500;
    }
    .primary:hover { background: #111827; }
    .empty { text-align: center; padding: 3rem 1rem; border: 1px dashed #d1d5db; border-radius: 8px; }
    .empty p { color: #6b7280; margin: 0 0 1rem; }
    .cards { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.75rem; }
    .group { padding: 0; }
    .card {
      padding: 0.9rem 1rem; border: 1px solid #e5e7eb; border-radius: 8px;
      background: white; display: flex; flex-direction: column; gap: 0.4rem;
    }
    .card:hover { border-color: #c7d2fe; }
    .card-q {
      color: #111827; text-decoration: none; font-weight: 500; line-height: 1.4;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .meta { display: flex; gap: 0.5rem; align-items: center; font-size: 0.85rem; color: #6b7280; flex-wrap: wrap; }
    .meta a { color: #4f46e5; text-decoration: none; }
    .meta a:hover { text-decoration: underline; }
    .muted { color: #6b7280; }
    .error { color: #b91c1c; }
  `],
})
export class EssayListComponent implements OnInit {
  private readonly essaysSvc = inject(EssaysService);

  readonly essays = signal<Essay[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  // RLS already scopes `essaysSvc.list()` to the signed-in user's rows,
  // so no client-side user_id filter is needed.
  readonly grouped = computed(() => {
    const drafts: Essay[] = [];
    const finished: Essay[] = [];
    for (const e of this.essays()) {
      (e.status === 'finished' ? finished : drafts).push(e);
    }
    return [
      { status: 'draft' as EssayStatus, items: drafts },
      { status: 'finished' as EssayStatus, items: finished },
    ];
  });

  async ngOnInit(): Promise<void> {
    try {
      this.essays.set(await this.essaysSvc.list());
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}

import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canMatch: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login.component').then(
        (m) => m.LoginComponent,
      ),
  },
  {
    path: 'signup',
    canMatch: [guestGuard],
    loadComponent: () =>
      import('./features/auth/signup.component').then(
        (m) => m.SignupComponent,
      ),
  },
  {
    path: 'app',
    canMatch: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/essays/list/essay-list.component').then(
            (m) => m.EssayListComponent,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/essays/new/essay-new.component').then(
            (m) => m.EssayNewComponent,
          ),
      },
      {
        path: 'edit/:id',
        loadComponent: () =>
          import('./features/essays/edit/essay-edit.component').then(
            (m) => m.EssayEditComponent,
          ),
      },
      {
        path: 'view/:id',
        loadComponent: () =>
          import('./features/essays/view/essay-view.component').then(
            (m) => m.EssayViewComponent,
          ),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'app' },
  { path: '**', redirectTo: 'app' },
];

import { Routes } from '@angular/router';
import { MainLayout } from './layout/main-layout/main-layout';
import { familyAuthGuard, familyChildAuthGuard } from './auth/family-auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login').then(m => m.Login)
  },
  {
    path: '',
    component: MainLayout,
    canActivate: [familyAuthGuard],
    canActivateChild: [familyChildAuthGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./layout/dashboard/dashboard')
            .then(m => m.Dashboard)
      },
      {
        path: 'ppf',
        loadComponent: () => import('./PPF/ppf/ppf').then(m => m.Ppf)
      },
      {
        path: 'settings',
        loadComponent: () => import('./layout/settings/settings').then(m => m.Settings)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];


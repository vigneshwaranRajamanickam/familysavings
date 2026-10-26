import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { FamilyAuthService } from './local-family-auth.service';

async function requireFamilySession(): Promise<boolean | ReturnType<Router['parseUrl']>> {
  const auth = inject(FamilyAuthService);
  const router = inject(Router);
  await auth.initialize();
  return auth.isAuthenticated || router.parseUrl('/login');
}

export const familyAuthGuard: CanActivateFn = () => requireFamilySession();
export const familyChildAuthGuard: CanActivateChildFn = () => requireFamilySession();

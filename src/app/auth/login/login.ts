import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FamilyAuthService } from '../local-family-auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html'
})
export class Login implements OnInit {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly router = inject(Router);
  readonly auth = inject(FamilyAuthService);

  readonly ready = signal(false);
  mode: 'signin' | 'create-family' | 'forgot-password' | 'reset-password' = 'signin';
  familyName = '';
  adminName = '';
  email = '';
  password = '';
  confirmPassword = '';
  phone = '';
  otp = '';
  otpSent = false;
  noticeMessage = '';
  errorMessage = '';
  isSubmitting = false;
  isEntering = false;

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!this.isBrowser) {
      this.ready.set(true);
      return;
    }
    const timeoutId = setTimeout(() => {
      if (!this.ready()) {
        this.errorMessage = 'Supabase is taking too long to respond. Check your project URL, network, and browser console.';
        this.ready.set(true);
      }
    }, 10000);
    try {
      await this.auth.initialize();
      this.ready.set(true);
      if (this.auth.isAuthenticated) await this.enterWorkspace();
      else if (this.auth.authError) this.errorMessage = this.auth.authError;
    } catch (error) {
      this.ready.set(true);
      this.errorMessage = error instanceof Error ? error.message : 'Could not initialize Supabase Auth.';
    } finally {
      clearTimeout(timeoutId);
    }
  }

  setMode(mode: 'signin' | 'create-family' | 'forgot-password' | 'reset-password'): void {
    this.mode = mode;
    this.otpSent = false;
    this.otp = '';
    this.noticeMessage = '';
    this.errorMessage = '';
  }

  async continueWithEmail(): Promise<void> {
    this.errorMessage = '';
    this.noticeMessage = '';
    if (!this.validateFamilyDraft()) return;
    this.isSubmitting = true;
    try {
      const familyDraft = this.mode === 'create-family'
        ? { name: this.familyName.trim(), adminName: this.adminName.trim() }
        : undefined;
      await this.auth.signInWithEmail(this.email, this.password, familyDraft);
      await this.enterWorkspace();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Email sign-in failed.';
      this.isSubmitting = false;
    }
  }

  async requestPasswordReset(): Promise<void> {
    this.errorMessage = '';
    this.noticeMessage = '';
    this.isSubmitting = true;
    try {
      await this.auth.requestPasswordReset(this.email);
      this.noticeMessage = 'If an account exists for this email, a password reset link has been sent.';
      this.mode = 'reset-password';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Could not request a password reset.';
    } finally {
      this.isSubmitting = false;
    }
  }

  async completePasswordReset(): Promise<void> {
    this.errorMessage = '';
    this.noticeMessage = '';
    if (this.password.length < 8) {
      this.errorMessage = 'Use a password with at least 8 characters.';
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'The passwords do not match.';
      return;
    }
    this.isSubmitting = true;
    try {
      await this.auth.completePasswordRecovery(this.password);
      await this.enterWorkspace();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Could not update the password.';
      this.isSubmitting = false;
    }
  }


  private validateFamilyDraft(): boolean {
    if (this.mode !== 'create-family') return true;
    if (this.familyName.trim() && this.adminName.trim()) return true;
    this.errorMessage = 'Enter the family name and admin name before continuing.';
    return false;
  }

  private async enterWorkspace(): Promise<void> {
    this.isEntering = true;
    const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    await new Promise(resolve => setTimeout(resolve, reducedMotion ? 120 : 1150));
    await this.router.navigateByUrl('/dashboard');
  }
}

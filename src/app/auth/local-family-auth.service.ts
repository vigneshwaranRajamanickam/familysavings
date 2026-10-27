import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type FamilyRole = 'admin' | 'member';

export interface FamilyMember {
  id: string;
  userId: string;
  familyId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: FamilyRole;
}

export interface FamilyWorkspace {
  id: string;
  name: string;
  members: FamilyMember[];
  logoDataUrl?: string;
}

interface LocalUser { id: string; email: string; phone: string | null; }
interface Account { user: LocalUser; password: string; familyId: string; memberId: string; }
interface AuthState { user: LocalUser | null; family: FamilyWorkspace | null; member: FamilyMember | null; ready: boolean; error: string; }

const ACCOUNTS = 'familysavings.accounts.v1';
const FAMILIES = 'familysavings.families.v1';
const SESSION = 'familysavings.session.v1';
const RESET = 'familysavings.reset.v1';

@Injectable({ providedIn: 'root' })
export class FamilyAuthService {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly state = signal<AuthState>({ user: null, family: null, member: null, ready: false, error: '' });

  get isReady(): boolean { return this.state().ready; }
  get authError(): string { return this.state().error; }
  get currentUser(): LocalUser | null { return this.state().user; }
  get currentFamily(): FamilyWorkspace | null { return this.state().family; }
  get currentMember(): FamilyMember | null { return this.state().member; }
  get isPasswordRecovery(): boolean { return false; }
  get isAuthenticated(): boolean { return !!this.currentFamily && !!this.currentMember; }
  get isAdmin(): boolean { return this.currentMember?.role === 'admin'; }

  async initialize(): Promise<void> {
    const id = this.browser ? localStorage.getItem(SESSION) : null;
    const account = this.accounts().find(item => item.user.id === id);
    if (account) this.activate(account);
    this.state.update(value => ({ ...value, ready: true }));
  }

  async signInWithEmail(email: string, password: string, draft?: { name: string; adminName: string }): Promise<'authenticated'> {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) throw new Error('Enter your email address and password.');
    const accounts = this.accounts();
    if (draft) {
      if (!draft.name.trim() || !draft.adminName.trim()) throw new Error('Enter the family name and admin name.');
      if (accounts.some(item => item.user.email === normalized)) throw new Error('An account with this email already exists. Sign in instead.');
      const userId = this.id();
      const familyId = this.id();
      const memberId = this.id();
      const account: Account = { user: { id: userId, email: normalized, phone: null }, password, familyId, memberId };
      const family: FamilyWorkspace = { id: familyId, name: draft.name.trim(), members: [{ id: memberId, userId, familyId, name: draft.adminName.trim(), email: normalized, phone: null, role: 'admin' }] };
      this.saveAccounts([...accounts, account]);
      this.saveFamily(family);
      this.activate(account);
      return 'authenticated';
    }
    const account = accounts.find(item => item.user.email === normalized);
    if (!account || account.password !== password) throw new Error('Incorrect email or password.');
    this.activate(account);
    return 'authenticated';
  }

  async requestPasswordReset(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) throw new Error('Enter the email address for your account.');
    if (!this.accounts().some(item => item.user.email === normalized)) throw new Error('No account was found with that email address.');
    if (this.browser) localStorage.setItem(RESET, normalized);
  }

  async completePasswordRecovery(password: string): Promise<void> {
    if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
    const email = this.browser ? localStorage.getItem(RESET) : null;
    const accounts = this.accounts();
    const index = accounts.findIndex(item => item.user.email === email);
    if (index < 0) throw new Error('Request a password reset first.');
    accounts[index].password = password;
    this.saveAccounts(accounts);
    if (this.browser) localStorage.removeItem(RESET);
    this.activate(accounts[index]);
  }

  async addMember(name: string, email: string, phone: string, requestedPassword = ''): Promise<{ email: string; temporaryPassword: string }> {
    if (!this.isAdmin || !this.currentFamily) throw new Error('Only the family admin can invite members.');
    const normalizedEmail = email.trim().toLowerCase() || null;
    const normalizedPhone = phone.trim() || null;
    if (!name.trim() || Number(!!normalizedEmail) + Number(!!normalizedPhone) !== 1) throw new Error('Enter the member name and exactly one email address or phone number.');
    if (!normalizedEmail) throw new Error('Enter an email address so the member can sign in.');
    if (this.accounts().some(account => account.user.email === normalizedEmail)) throw new Error('An account with this email already exists.');
    const userId = this.id();
    const memberId = this.id();
    const temporaryPassword = requestedPassword.trim() || `Member@${Math.random().toString(36).slice(2, 10)}`;
    if (temporaryPassword.length < 8) throw new Error('Temporary password must contain at least 8 characters.');
    const account: Account = { user: { id: userId, email: normalizedEmail, phone: null }, password: temporaryPassword, familyId: this.currentFamily.id, memberId };
    const family = { ...this.currentFamily, members: [...this.currentFamily.members, { id: memberId, userId, familyId: this.currentFamily.id, name: name.trim(), email: normalizedEmail, phone: null, role: 'member' as const }] };
    this.saveAccounts([...this.accounts(), account]);
    this.saveFamily(family);
    this.state.update(value => ({ ...value, family }));
    return { email: normalizedEmail, temporaryPassword };
  }

  async removeMember(id: string): Promise<void> {
    if (!this.isAdmin || !this.currentFamily) throw new Error('Only the family admin can remove members.');
    const family = { ...this.currentFamily, members: this.currentFamily.members.filter(member => member.id === id ? member.role === 'admin' : true) };
    this.saveFamily(family);
    this.state.update(value => ({ ...value, family }));
  }

  async updateFamilyLogo(logoDataUrl: string | null): Promise<void> {
    if (!this.isAdmin || !this.currentFamily) throw new Error('Only the family admin can change the family logo.');
    const family = { ...this.currentFamily, logoDataUrl: logoDataUrl ?? undefined };
    this.saveFamily(family);
    this.state.update(value => ({ ...value, family }));
  }

  async signOut(): Promise<void> {
    if (this.browser) localStorage.removeItem(SESSION);
    this.state.set({ user: null, family: null, member: null, ready: true, error: '' });
  }

  private activate(account: Account): void {
    const family = this.families().find(item => item.id === account.familyId) ?? null;
    const member = family?.members.find(item => item.id === account.memberId) ?? null;
    if (!family || !member) return;
    if (this.browser) localStorage.setItem(SESSION, account.user.id);
    this.state.set({ user: account.user, family, member, ready: true, error: '' });
  }
  private accounts(): Account[] { return this.read<Account[]>(ACCOUNTS, []); }
  private families(): FamilyWorkspace[] { return this.read<FamilyWorkspace[]>(FAMILIES, []); }
  private saveAccounts(value: Account[]): void { if (this.browser) localStorage.setItem(ACCOUNTS, JSON.stringify(value)); }
  private saveFamily(family: FamilyWorkspace): void { if (this.browser) localStorage.setItem(FAMILIES, JSON.stringify([...this.families().filter(item => item.id !== family.id), family])); }
  private read<T>(key: string, fallback: T): T { if (!this.browser) return fallback; try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)) as T; } catch { return fallback; } }
  private id(): string { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

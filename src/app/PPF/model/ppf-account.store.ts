import { Injectable, inject } from '@angular/core';
import { PPFAccount, PPFTransaction } from './ppf-model';
import { FamilyAuthService } from '../../auth/local-family-auth.service';

@Injectable({ providedIn: 'root' })
export class PpfAccountStore {
  private readonly auth = inject(FamilyAuthService);
  

  async loadAccounts(): Promise<PPFAccount[]> {
    const familyId = this.auth.currentFamily?.id;
    if (!familyId) throw new Error('Your signed-in user is not linked to a family.');
    const storageKey = `familysavings.ppf.${familyId}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved || JSON.parse(saved).length === 0) {
        const sampleAccounts = this.createSampleAccounts();
        localStorage.setItem(storageKey, JSON.stringify(sampleAccounts));
        return sampleAccounts;
      }
      return JSON.parse(saved) as PPFAccount[];
    }
    catch { return []; }
  }

  async saveAccount(account: PPFAccount): Promise<void> {
    const familyId = this.auth.currentFamily?.id;
    if (!familyId || !this.auth.isAdmin) throw new Error('Only the family admin can save PPF changes.');

    const accounts = await this.loadAccounts();
    const index = accounts.findIndex(item => item.id === account.id);
    if (index >= 0) accounts[index] = account; else accounts.push(account);
    localStorage.setItem(`familysavings.ppf.${familyId}`, JSON.stringify(accounts));
  }

  private createSampleAccounts(): PPFAccount[] {
    return [
      this.createSampleAccount('sample-ppf-001', 'PPF-2020-001', 'Ananya Sharma', 'State Bank of India', 7000, 7.1),
      this.createSampleAccount('sample-ppf-002', 'PPF-2022-014', 'Rohan Sharma', 'HDFC Bank', 5000, 7.1)
    ];
  }

  private createSampleAccount(id: string, accountNumber: string, holderName: string, bankName: string, monthlyDeposit: number, rate: number): PPFAccount {
    let deposits = 0;
    let interest = 0;
    const transactions = Array.from({ length: 12 }, (_, index) => {
      deposits += monthlyDeposit;
      const monthlyInterest = Number((deposits * rate / 1200).toFixed(2));
      interest += monthlyInterest;
      const transaction: PPFTransaction = {
        month: index + 1,
        date: new Date(2025, 3 + index, 5).toISOString().slice(0, 10),
        amount: monthlyDeposit,
        interestRate: rate,
        minBalance: deposits,
        monthlyInterest,
        yearlyInterest: index === 11 ? Number(interest.toFixed(2)) : undefined,
        balance: Number((deposits + interest).toFixed(2))
      };
      return transaction;
    });
    return {
      id,
      accountNumber,
      holderName,
      bankName,
      totalDeposit: deposits,
      totalInterest: Number(interest.toFixed(2)),
      totalValue: Number((deposits + interest).toFixed(2)),
      tenureYears: 15,
      transactions
    };
  }
}

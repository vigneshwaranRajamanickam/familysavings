export interface PPFTransaction {
  month: number;
  date: string;
  amount: number;
  interestRate: number;
  minBalance: number;
  monthlyInterest: number;
  yearlyInterest?: number;
  balance: number;
}

export interface PPFAccount {
  id: string;
  accountNumber: string;
  holderName: string;
  bankName: string;
  totalDeposit: number;
  totalInterest: number;
  totalValue: number;
  tenureYears: number;
  transactions: PPFTransaction[];
}
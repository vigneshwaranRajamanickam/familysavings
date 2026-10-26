import { ChangeDetectorRef, Component, OnInit, ViewChild, ElementRef, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule, MatSelectChange } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { PPFAccount, PPFTransaction } from '../model/ppf-model';
import { PpfAccountStore } from '../model/ppf-account.store';
import { FamilyAuthService } from '../../auth/local-family-auth.service';

Chart.register(...registerables);

const EMPTY_ACCOUNT: PPFAccount = {
  id: '',
  accountNumber: '',
  holderName: '',
  bankName: '',
  totalDeposit: 0,
  totalInterest: 0,
  totalValue: 0,
  tenureYears: 15,
  transactions: []
};

@Component({
  selector: 'app-ppf',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule
  ],
  templateUrl: './ppf.html',
  styleUrls: ['./ppf.scss']
})
export class Ppf implements OnInit, AfterViewInit {
  private readonly accountStore = inject(PpfAccountStore);
  private readonly changeDetector = inject(ChangeDetectorRef);
  readonly auth = inject(FamilyAuthService);
  accounts: PPFAccount[] = [];
  isLoadingAccounts = true;
  accountLoadError = '';
  @ViewChild('growthChart') growthChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('ratioChart') ratioChartCanvas!: ElementRef<HTMLCanvasElement>;
  dataSource = new MatTableDataSource<PPFTransaction>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  growthChart!: Chart;
  ratioChart!: Chart;
  selectedAccountId = '';
  selectedYear: string = 'all';
  isAddModalOpen: boolean = false;
  depositDateError = '';
  editingTransaction: PPFTransaction | null = null;
  editAmountValue = 0;
  amountEditError = '';
  chart!: Chart;

  displayedColumns: string[] = [
    'month',
    'date',
    'amount',
    'interestRate',
    'minBalance',
    'monthlyInterest',
    'yearlyInterest',
    'balance'
  ];

  newTx = {
    date: new Date(),
    amount: 1500,
    interestRate: 7.1
  };

  ngOnInit(): void {
    void this.loadAccounts();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.dataSource.paginator = this.paginator;
      this.renderCharts();
    }, 200);
  }

  private async loadAccounts(): Promise<void> {
    this.isLoadingAccounts = true;
    this.accountLoadError = '';
    try {
      this.accounts = await this.accountStore.loadAccounts();
      this.selectedAccountId = this.accounts[0]?.id ?? '';
      this.updateDataSource();
    } catch (error) {
      this.accountLoadError = error instanceof Error ? error.message : 'Could not load PPF accounts.';
    } finally {
      this.isLoadingAccounts = false;
      this.changeDetector.detectChanges();
      setTimeout(() => this.renderCharts(), 50);
    }
  }

  renderCharts(): void {
    this.renderGrowthChart();
    this.renderRatioChart();
  }
  get activeAccount(): PPFAccount {
    return this.accounts.find(acc => acc.id === this.selectedAccountId) || this.accounts[0] || EMPTY_ACCOUNT;
  }

  get canManagePpf(): boolean {
    return this.auth.isAdmin;
  }

  private get nextDepositMonthRange(): { start: Date; end: Date } | null {
    const latestTransaction = this.activeAccount.transactions.reduce<PPFTransaction | null>(
      (latest, transaction) => !latest || transaction.date > latest.date ? transaction : latest,
      null
    );
    if (!latestTransaction) return null;

    const [year, month] = latestTransaction.date.split('-').map(Number);
    return {
      start: new Date(year, month, 1),
      end: new Date(year, month + 1, 0)
    };
  }

  get minimumDepositDate(): Date | null {
    return this.nextDepositMonthRange?.start ?? null;
  }

  get maximumDepositDate(): Date | null {
    return this.nextDepositMonthRange?.end ?? null;
  }

  isDepositDateAllowed = (date: Date | null): boolean => {
    if (!date || Number.isNaN(date.getTime())) return false;
    const range = this.nextDepositMonthRange;
    return !range || (
      date.getFullYear() === range.start.getFullYear() &&
      date.getMonth() === range.start.getMonth()
    );
  };

  updateDataSource(): void {
    this.dataSource.data = this.filteredTransactions;
    if (this.paginator) {
      this.dataSource.paginator = this.paginator;
    }
  }

  // Update your onAccountChange and addDeposit methods to call this.updateDataSource()
  onAccountChange(event: MatSelectChange): void {
    this.selectedAccountId = event.value;
    this.updateDataSource();
    setTimeout(() => this.updateChart(), 50);
  }
  renderGrowthChart(): void {
    if (!this.growthChartCanvas) return;
    const ctx = this.growthChartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    if (this.growthChart) {
      this.growthChart.destroy();
    }

    const labels = this.activeAccount.transactions.map(t => `M${t.month}`);
    const depositData = this.activeAccount.transactions.map(t => t.minBalance); // Cumulative deposits approximation
    const balanceData = this.activeAccount.transactions.map(t => t.balance);

    this.growthChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Deposits',
            data: depositData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3
          },
          {
            label: 'Balance',
            data: balanceData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { autoSkip: true, maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } }
          },
          y: {
            ticks: { callback: (value) => Number(value).toLocaleString('en-IN'), maxTicksLimit: 5, font: { size: 10 } }
          }
        }
      }
    });
  }

  renderRatioChart(): void {
    if (!this.ratioChartCanvas) return;
    const ctx = this.ratioChartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    if (this.ratioChart) {
      this.ratioChart.destroy();
    }

    const totalValue = this.activeAccount.totalValue;
    const principalPct = totalValue > 0
      ? Number(((this.activeAccount.totalDeposit / totalValue) * 100).toFixed(1))
      : 0;
    const interestPct = totalValue > 0
      ? Number(((this.activeAccount.totalInterest / totalValue) * 100).toFixed(1))
      : 0;

    this.ratioChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Principal Share', 'Interest Share'],
        datasets: [{
          data: [principalPct, interestPct],
          backgroundColor: ['#10b981', '#3b82f6'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,

        cutout: '75%',
        plugins: { legend: { display: false } }
      }
    });
  }

  updateChart(): void {
    this.renderCharts();
  }

  get filteredTransactions(): PPFTransaction[] {
    if (this.selectedYear === 'all') {
      return this.activeAccount.transactions;
    }
    return this.activeAccount.transactions.filter(tx => {
      const txYear = new Date(tx.date).getFullYear();
      return txYear.toString() === this.selectedYear;
    });
  }


  openAddModal(): void {
    const range = this.nextDepositMonthRange;
    this.newTx.date = range ? new Date(range.start) : new Date();
    this.depositDateError = '';
    this.isAddModalOpen = true;
  }

  closeAddModal(): void {
    this.isAddModalOpen = false;
    this.depositDateError = '';
  }

  startAmountEdit(transaction: PPFTransaction): void {
    if (!this.canManagePpf) return;
    this.editingTransaction = transaction;
    this.editAmountValue = transaction.amount;
    this.amountEditError = '';
  }

  cancelAmountEdit(): void {
    this.editingTransaction = null;
    this.amountEditError = '';
  }

  async saveAmountEdit(transaction: PPFTransaction): Promise<void> {
    if (!this.canManagePpf) return;
    const amount = Number(this.editAmountValue);
    if (transaction !== this.editingTransaction || !Number.isFinite(amount) || amount <= 0) {
      this.amountEditError = 'Enter an amount greater than zero.';
      return;
    }

    const account = this.activeAccount;
    const previousAccount = structuredClone(account);
    account.totalDeposit += amount - transaction.amount;
    transaction.amount = amount;
    this.recalculateAccountFrom(account, transaction);
    this.cancelAmountEdit();
    try {
      await this.accountStore.saveAccount(account);
    } catch (error) {
      Object.assign(account, previousAccount);
      this.amountEditError = error instanceof Error ? error.message : 'Could not save this amount.';
      this.updateDataSource();
      return;
    }
    this.updateDataSource();
    setTimeout(() => this.updateChart(), 50);
  }

  private recalculateAccountFrom(account: PPFAccount, changedTransaction: PPFTransaction): void {
    account.transactions.sort((left, right) => left.date.localeCompare(right.date));
    const changedIndex = account.transactions.indexOf(changedTransaction);
    if (changedIndex < 0) return;

    let previousBalance = changedIndex > 0 ? account.transactions[changedIndex - 1].balance : 0;
    let oldInterest = 0;
    let recalculatedInterest = 0;

    for (let index = 0; index < account.transactions.length; index++) {
      const transaction = account.transactions[index];
      transaction.month = index + 1;
      if (index < changedIndex) continue;

      oldInterest += transaction.monthlyInterest;
      transaction.minBalance = previousBalance + transaction.amount;
      transaction.monthlyInterest = Math.round(
        (transaction.minBalance * (transaction.interestRate / 100)) / 12
      );
      transaction.balance = transaction.minBalance + transaction.monthlyInterest;
      recalculatedInterest += transaction.monthlyInterest;
      previousBalance = transaction.balance;
    }

    account.totalInterest += recalculatedInterest - oldInterest;
    account.totalValue = account.totalDeposit + account.totalInterest;
  }

  async addDeposit(): Promise<void> {
    if (!this.canManagePpf) return;
    const acc = this.activeAccount;
    const amount = Number(this.newTx.amount);
    const interestRate = Number(this.newTx.interestRate);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(interestRate) || interestRate < 0) return;

    const dateObj = new Date(this.newTx.date);
    if (!this.isDepositDateAllowed(dateObj)) {
      const range = this.nextDepositMonthRange;
      this.depositDateError = range
        ? `Choose a date in ${range.start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}.`
        : 'Choose a valid deposit date.';
      return;
    }

    const formattedDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    const monthKey = formattedDate.slice(0, 7);
    const transaction = acc.transactions.find(tx => tx.date.slice(0, 7) === monthKey);
    const previousAccount = structuredClone(acc);

    if (transaction) {
      transaction.amount += amount;
    } else {
      acc.transactions.push({
        month: 0,
        date: formattedDate,
        amount,
        interestRate,
        minBalance: 0,
        monthlyInterest: 0,
        balance: 0
      });
    }

    const changedTransaction = transaction ?? acc.transactions[acc.transactions.length - 1];
    acc.totalDeposit += amount;
    this.recalculateAccountFrom(acc, changedTransaction);
    try {
      await this.accountStore.saveAccount(acc);
    } catch (error) {
      Object.assign(acc, previousAccount);
      this.depositDateError = error instanceof Error ? error.message : 'Could not save this deposit.';
      this.updateDataSource();
      return;
    }
    this.selectedYear = 'all';
    this.updateDataSource();
    this.paginator?.lastPage();

    this.closeAddModal();
    setTimeout(() => this.updateChart(), 50);
  }

  renderChart(): void {
    if (!this.growthChartCanvas) return;

    const ctx = this.growthChartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    // Destroy existing chart instance to avoid overlap bugs
    if (this.chart) {
      this.chart.destroy();
    }

    const labels = this.activeAccount.transactions.map(t => `Month ${t.month}`);
    const balanceData = this.activeAccount.transactions.map(t => t.balance);

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Account Balance (₹)',
          data: balanceData,
          borderColor: '#3f51b5',
          backgroundColor: 'rgba(63, 81, 181, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => '₹' + Number(value).toLocaleString('en-IN')
            }
          }
        }
      }
    });
  }
  // Add Account Modal State & Form Model
  isAddAccountModalOpen: boolean = false;
  accountNumberError = '';
  newAccount = {
    accountNumber: this.generateAccountNumber(),
    holderName: '',
    bankName: '',
    tenureYears: 15
  };

  private generateAccountNumber(): string {
    let accountNumber: string;
    do {
      accountNumber = 'PPF-' + Math.floor(100000000000 + Math.random() * 900000000000);
    } while (this.accounts.some(account => account.accountNumber === accountNumber));
    return accountNumber;
  }

  openAddAccountModal(): void {
    this.isAddAccountModalOpen = true;
  }

  closeAddAccountModal(): void {
    this.isAddAccountModalOpen = false;
    this.accountNumberError = '';
  }

  async addNewAccount(): Promise<void> {
    if (!this.canManagePpf) return;
    const accountNumber = this.newAccount.accountNumber.trim();
    if (!accountNumber || !this.newAccount.holderName || !this.newAccount.bankName) return;

    const duplicateAccount = this.accounts.some(
      account => account.accountNumber.toLowerCase() === accountNumber.toLowerCase()
    );
    if (duplicateAccount) {
      this.accountNumberError = 'This account number is already in use.';
      return;
    }

    const newAcc: PPFAccount = {
      id: crypto.randomUUID(),
      accountNumber,
      holderName: this.newAccount.holderName,
      bankName: this.newAccount.bankName,
      totalDeposit: 0,
      totalInterest: 0,
      totalValue: 0,
      tenureYears: Number(this.newAccount.tenureYears),
      transactions: []
    };

    this.accounts.push(newAcc);
    try {
      await this.accountStore.saveAccount(newAcc);
    } catch (error) {
      this.accounts = this.accounts.filter(account => account !== newAcc);
      this.accountNumberError = error instanceof Error ? error.message : 'Could not save this account.';
      return;
    }
    this.selectedAccountId = newAcc.id; // Automatically select the newly created account
    this.selectedYear = 'all';
    this.updateDataSource();
    this.paginator?.firstPage();

    // Reset and close
    this.newAccount.holderName = '';
    this.newAccount.bankName = '';
    this.newAccount.accountNumber = this.generateAccountNumber();
    this.closeAddAccountModal();
    setTimeout(() => this.updateChart(), 50);
  }
}          

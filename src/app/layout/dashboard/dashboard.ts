import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { PpfAccountStore } from '../../PPF/model/ppf-account.store';
import { FamilyAuthService } from '../../auth/local-family-auth.service';
import { PPFAccount } from '../../PPF/model/ppf-model';

Chart.register(...registerables);

@Component({
  imports: [CommonModule, FormsModule, RouterLink],
  selector: 'app-dashboard',
  styleUrl: './dashboard.scss',
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit, AfterViewInit, OnDestroy {
  private readonly accountStore = inject(PpfAccountStore);
  private readonly changeDetector = inject(ChangeDetectorRef);
  readonly auth = inject(FamilyAuthService);
  accounts: PPFAccount[] = [];
  accountLoadError = '';
  newMember = { name: '', email: '', phone: '', temporaryPassword: '' };
  memberError = '';
  memberNotice = '';

  @ViewChild('accountComparisonChart') accountComparisonCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('portfolioRatioChart') portfolioRatioCanvas!: ElementRef<HTMLCanvasElement>;

  private accountComparisonChart?: Chart;
  private portfolioRatioChart?: Chart;

  todayLabel = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  get totalDeposits(): number {
    return this.accounts.reduce((total, account) => total + account.totalDeposit, 0);
  }

  get totalProfit(): number {
    return this.accounts.reduce((total, account) => total + account.totalInterest, 0);
  }

  get totalPortfolioValue(): number {
    return this.accounts.reduce((total, account) => total + account.totalValue, 0);
  }

  ngOnInit(): void {
    void this.loadAccounts();
  }

  ngAfterViewInit(): void {
    this.renderCharts();
  }

  ngOnDestroy(): void {
    this.accountComparisonChart?.destroy();
    this.portfolioRatioChart?.destroy();
  }

  private async loadAccounts(): Promise<void> {
    try {
      this.accounts = await this.accountStore.loadAccounts();
    } catch (error) {
      this.accountLoadError = error instanceof Error ? error.message : 'Could not load family PPF data.';
    }
    this.changeDetector.detectChanges();
    setTimeout(() => this.renderCharts(), 50);
  }

  async addFamilyMember(): Promise<void> {
    this.memberError = '';
    this.memberNotice = '';
    try {
      const memberAccount = await this.auth.addMember(this.newMember.name, this.newMember.email, this.newMember.phone, this.newMember.temporaryPassword);
      this.newMember = { name: '', email: '', phone: '', temporaryPassword: '' };
      this.memberNotice = `Member added. Login email: ${memberAccount.email} | Temporary password: ${memberAccount.temporaryPassword}`;
    } catch (error) {
      this.memberError = error instanceof Error ? error.message : 'Could not add this family member.';
    }
  }

  async removeFamilyMember(memberId: string, memberName: string): Promise<void> {
    if (!globalThis.confirm(`Remove ${memberName} from this family?`)) return;
    this.memberError = '';
    this.memberNotice = '';
    try {
      await this.auth.removeMember(memberId);
      this.memberNotice = `${memberName} was removed from this family.`;
    } catch (error) {
      this.memberError = error instanceof Error ? error.message : 'Could not remove this family member.';
    }
  }

  private renderCharts(): void {
    if (!this.accountComparisonCanvas || !this.portfolioRatioCanvas) return;
    const accountContext = this.accountComparisonCanvas.nativeElement.getContext('2d');
    const ratioContext = this.portfolioRatioCanvas.nativeElement.getContext('2d');
    if (!accountContext || !ratioContext) return;

    this.accountComparisonChart?.destroy();
    this.portfolioRatioChart?.destroy();

    this.accountComparisonChart = new Chart(accountContext, {
      type: 'bar',
      data: {
        labels: this.accounts.map(account => account.holderName),
        datasets: [
          {
            label: 'Deposits',
            data: this.accounts.map(account => account.totalDeposit),
            backgroundColor: '#087f5b',
            borderRadius: 6
          },
          {
            label: 'Profit',
            data: this.accounts.map(account => account.totalInterest),
            backgroundColor: '#3478c8',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'end' } },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: { callback: value => Number(value).toLocaleString('en-IN') }
          }
        }
      }
    });

    this.portfolioRatioChart = new Chart(ratioContext, {
      type: 'doughnut',
      data: {
        labels: ['Deposits', 'Profit'],
        datasets: [{
          data: [this.totalDeposits, this.totalProfit],
          backgroundColor: ['#087f5b', '#3478c8'],
          borderWidth: 0,
          hoverOffset: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }
}

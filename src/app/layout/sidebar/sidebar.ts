import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FamilyAuthService } from '../../auth/local-family-auth.service';

@Component({
  imports: [RouterLink, RouterLinkActive],
  selector: 'app-sidebar',
  styleUrl: './sidebar.scss',
  templateUrl: './sidebar.html',
})
export class Sidebar {
  readonly auth = inject(FamilyAuthService);
  @Input() open = false;
  @Output() closeRequested = new EventEmitter<void>();

  menuItems = [
    { label: 'Dashboard', icon: '⌂', route: '/dashboard' },
    { label: 'PPF', icon: '▤', route: '/ppf' },
    { label: 'Settings', icon: '⚙', route: '/settings' },
    // { label: 'Transactions', icon: '⇄', route: '/transactions' },
    // { label: 'Interest Calculator', icon: '%', route: '/interest-calculator' },
    // { label: 'Savings Goals', icon: '◎', route: '/goals' },
    // { label: 'Family Members', icon: '♧', route: '/family' },
    // { label: 'Reports', icon: '▥', route: '/reports' },
    // { label: 'Settings', icon: '⚙', route: '/settings' }
  ];
}

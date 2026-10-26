import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FamilyAuthService } from '../../auth/local-family-auth.service';

@Component({
  imports: [CommonModule],
  selector: 'app-header',
  styleUrl: './header.scss',
  templateUrl: './header.html',
})
export class Header {
    today = new Date();
  readonly auth = inject(FamilyAuthService);
  private readonly router = inject(Router);
  @ViewChild('profileMenu') private profileMenu?: ElementRef<HTMLDetailsElement>;
  @Input() mobileMenuOpen = false;
  @Output() menuToggle = new EventEmitter<void>();

  async signOut(): Promise<void> {
    await this.auth.signOut();
    void this.router.navigateByUrl('/login');
  }

  get familyInitial(): string {
    return this.auth.currentFamily?.name.trim().charAt(0).toUpperCase() || 'F';
  }

  @HostListener('document:click', ['$event'])
  closeProfileOnOutsideClick(event: MouseEvent): void {
    const menu = this.profileMenu?.nativeElement;
    if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
  }

  @HostListener('document:keydown.escape')
  closeProfileOnEscape(): void {
    const menu = this.profileMenu?.nativeElement;
    if (menu?.open) menu.open = false;
  }
}

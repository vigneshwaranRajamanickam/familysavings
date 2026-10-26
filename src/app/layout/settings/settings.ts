import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FamilyAuthService } from '../../auth/local-family-auth.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-settings',
  styleUrl: './settings.scss',
  templateUrl: './settings.html'
})
export class Settings {
  readonly auth = inject(FamilyAuthService);
  notice = '';
  error = '';

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.error = '';
    this.notice = '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      this.error = 'Choose a PNG, JPEG, or WebP image.';
      input.value = '';
      return;
    }
    if (file.size > 1024 * 1024) {
      this.error = 'Choose an image smaller than 1 MB.';
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') {
        this.error = 'The selected image could not be read.';
        return;
      }
      try {
        await this.auth.updateFamilyLogo(reader.result);
        this.notice = 'Family logo updated.';
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Could not save the family logo.';
      }
    };
    reader.onerror = () => this.error = 'The selected image could not be read.';
    reader.readAsDataURL(file);
    input.value = '';
  }

  async removeLogo(): Promise<void> {
    this.error = '';
    this.notice = '';
    try {
      await this.auth.updateFamilyLogo(null);
      this.notice = 'Family logo removed. The family initial is shown instead.';
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not remove the family logo.';
    }
  }

  get adminMembers() {
    return this.auth.currentFamily?.members.filter(member => member.role === 'admin') ?? [];
  }

  async removeMember(memberId: string, memberName: string): Promise<void> {
    if (!globalThis.confirm(`Remove ${memberName} from this family?`)) return;
    this.notice = '';
    this.error = '';
    try {
      await this.auth.removeMember(memberId);
      this.notice = `${memberName} was removed from this family.`;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not remove this family member.';
    }
  }
}
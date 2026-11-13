import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

interface TenantStepData {
  tenantName: string;
  city: string;
  state: string;
  pastorPresidente: string;
  phone: string;
  contactEmail: string;
}

interface AdminStepData {
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
  adminPasswordConfirm: string;
}

/**
 * Wizard de 2 passos, só client-side — diferente do Django original, que
 * salvava um arquivo temp em disco entre dois requests via sessão. Aqui
 * nada toca o backend até o submit final do passo 2, que manda tudo de
 * uma vez (multipart/form-data) pra um único endpoint atômico
 * (POST /api/onboarding/signup — ver onboarding.service.ts).
 */
@Component({
  selector: 'app-onboarding',
  imports: [FormsModule],
  template: `
    <div class="wizard">
      <h1>Cadastre seu campo</h1>
      <p class="steps">Passo {{ step() }} de 2</p>

      @if (step() === 1) {
        <form (ngSubmit)="goToStep2()">
          <label>
            Nome do campo *
            <input name="tenantName" [(ngModel)]="tenant.tenantName" required minlength="2" />
          </label>
          <label>
            Logo (opcional — fundo liso é removido automaticamente)
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" (change)="onLogoSelected($event)" />
          </label>
          <div class="row">
            <label>
              Cidade
              <input name="city" [(ngModel)]="tenant.city" />
            </label>
            <label>
              Estado
              <input name="state" [(ngModel)]="tenant.state" maxlength="2" />
            </label>
          </div>
          <label>
            Pastor presidente
            <input name="pastorPresidente" [(ngModel)]="tenant.pastorPresidente" />
          </label>
          <div class="row">
            <label>
              Telefone
              <input name="phone" [(ngModel)]="tenant.phone" />
            </label>
            <label>
              E-mail de contato
              <input type="email" name="contactEmail" [(ngModel)]="tenant.contactEmail" />
            </label>
          </div>
          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
          <button type="submit" [disabled]="!tenant.tenantName || tenant.tenantName.length < 2">
            Continuar
          </button>
        </form>
      } @else {
        <form (ngSubmit)="submit()">
          <label>
            E-mail do administrador *
            <input type="email" name="adminEmail" [(ngModel)]="admin.adminEmail" required />
          </label>
          <div class="row">
            <label>
              Nome
              <input name="adminFirstName" [(ngModel)]="admin.adminFirstName" />
            </label>
            <label>
              Sobrenome
              <input name="adminLastName" [(ngModel)]="admin.adminLastName" />
            </label>
          </div>
          <label>
            Senha *
            <input type="password" name="adminPassword" [(ngModel)]="admin.adminPassword" required minlength="6" />
          </label>
          <label>
            Confirmar senha *
            <input
              type="password"
              name="adminPasswordConfirm"
              [(ngModel)]="admin.adminPasswordConfirm"
              required
            />
          </label>
          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
          <div class="actions">
            <button type="button" class="secondary" (click)="step.set(1)">Voltar</button>
            <button type="submit" [disabled]="submitting()">
              {{ submitting() ? 'Enviando...' : 'Criar meu campo' }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      max-width: 32rem;
      margin: 3rem auto;
      padding: 0 1.25rem;
      font-family: system-ui, -apple-system, sans-serif;
    }
    h1 {
      color: #0c1e4e;
      margin-bottom: 0.25rem;
    }
    .steps {
      color: #64748b;
      margin-bottom: 1.5rem;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.85rem;
      color: #334155;
      flex: 1;
    }
    input {
      padding: 0.6rem 0.75rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.5rem;
      font-size: 0.95rem;
    }
    .row {
      display: flex;
      gap: 1rem;
    }
    button {
      padding: 0.7rem 1.25rem;
      border-radius: 0.6rem;
      border: none;
      background: #0c1e4e;
      color: white;
      font-weight: 600;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    button.secondary {
      background: transparent;
      color: #0c1e4e;
      border: 1px solid #cbd5e1;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
    }
    .error {
      color: #b91c1c;
      font-size: 0.85rem;
      margin: 0;
    }
  `,
})
export class OnboardingPage {
  readonly step = signal<1 | 2>(1);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  tenant: TenantStepData = {
    tenantName: '',
    city: '',
    state: '',
    pastorPresidente: '',
    phone: '',
    contactEmail: '',
  };
  admin: AdminStepData = {
    adminEmail: '',
    adminFirstName: '',
    adminLastName: '',
    adminPassword: '',
    adminPasswordConfirm: '',
  };
  logoFile: File | null = null;

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.logoFile = input.files?.[0] ?? null;
  }

  goToStep2(): void {
    this.error.set(null);
    this.step.set(2);
  }

  submit(): void {
    this.error.set(null);
    if (this.admin.adminPassword !== this.admin.adminPasswordConfirm) {
      this.error.set('As senhas não coincidem.');
      return;
    }

    const formData = new FormData();
    formData.set('tenantName', this.tenant.tenantName);
    formData.set('city', this.tenant.city);
    formData.set('state', this.tenant.state);
    formData.set('pastorPresidente', this.tenant.pastorPresidente);
    formData.set('phone', this.tenant.phone);
    formData.set('contactEmail', this.tenant.contactEmail);
    formData.set('adminEmail', this.admin.adminEmail);
    formData.set('adminFirstName', this.admin.adminFirstName);
    formData.set('adminLastName', this.admin.adminLastName);
    formData.set('adminPassword', this.admin.adminPassword);
    if (this.logoFile) {
      formData.set('logo', this.logoFile);
    }

    this.submitting.set(true);
    this.http.post('/api/onboarding/signup', formData).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigate(['/']);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err.error?.message ?? 'Não foi possível concluir o cadastro. Tente novamente.');
      },
    });
  }
}

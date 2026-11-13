import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

// TODO(Pitantech): substituir pelos dados reais de vendas antes de publicar
// — mesmo placeholder que existia em church_management/views.py::pricing
// no sistema Django original.
const WHATSAPP_NUMBER = '5545999999999';
const WHATSAPP_MESSAGE = 'Olá! Quero conhecer a Plataforma de Gestão Eclesiástica.';

@Component({
  selector: 'app-pricing',
  imports: [RouterLink],
  template: `
    <header class="nav">
      <div class="nav-inner">
        <span class="brand">Plataforma de Gestão Eclesiástica</span>
        <a class="btn btn-primary" [href]="whatsappUrl" target="_blank" rel="noopener noreferrer">
          Falar com a gente
        </a>
      </div>
    </header>

    <section class="hero">
      <span class="badge">Para igrejas de qualquer tamanho</span>
      <h1>Toda a gestão da sua igreja em um só sistema — <em>sem limite de congregações</em></h1>
      <p>
        Membros, tesouraria, carteirinhas digitais, cadastro em massa e relatórios em um só lugar.
        Um preço fixo — não importa quantas congregações ou membros sua obra tiver.
      </p>
      <div class="hero-ctas">
        <a class="btn btn-accent" href="#plano">Ver o plano</a>
        <a class="btn btn-outline" [href]="whatsappUrl" target="_blank" rel="noopener noreferrer">
          Falar no WhatsApp
        </a>
      </div>
      <ul class="hero-facts">
        <li>Sem fidelidade</li>
        <li>Cancele quando quiser</li>
        <li>Suporte em português</li>
        <li>Dados protegidos</li>
      </ul>
    </section>

    <section class="pains">
      <h2>Sua secretaria ainda depende disso?</h2>
      <div class="grid">
        @for (pain of pains; track pain) {
          <div class="card">{{ pain }}</div>
        }
      </div>
    </section>

    <section class="features">
      <h2>Tudo o que sua igreja precisa, em um só sistema</h2>
      <p class="muted">Sem módulo pago à parte. Se está no sistema, está incluso no plano.</p>
      <div class="grid">
        @for (feature of features; track feature.title) {
          <div class="card">
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.description }}</p>
          </div>
        }
      </div>
    </section>

    <section id="plano" class="plan">
      <h2>Um plano. Um preço. Sem letra miúda.</h2>
      <p class="muted">
        Muitos sistemas cobram por quantidade de membros ou de congregações — aqui o valor não muda
        conforme sua igreja cresce.
      </p>

      <div class="toggle">
        <span [class.active]="!annual()">Mensal</span>
        <button type="button" (click)="annual.set(!annual())" [attr.aria-pressed]="annual()">
          <span class="dot" [class.right]="annual()"></span>
        </button>
        <span [class.active]="annual()">Anual <small>2 meses grátis</small></span>
      </div>

      <div class="plan-card">
        <span class="plan-tag">Plano Completo</span>
        <p class="plan-scope">Congregações, igrejas e membros ilimitados</p>
        @if (!annual()) {
          <p class="price">R$ 200<small>/mês</small></p>
          <p class="muted small">Cobrado mensalmente</p>
        } @else {
          <p class="price">R$ 2.000<small>/ano</small></p>
          <p class="muted small">
            <s>R$ 2.400</s> economize R$ 400/ano — equivale a R$ 166,67/mês
          </p>
        }
        <ul class="plan-items">
          @for (item of planItems; track item) {
            <li>{{ item }}</li>
          }
        </ul>
        <a class="btn btn-accent full" [href]="whatsappUrl" target="_blank" rel="noopener noreferrer">
          Falar com a gente
        </a>
      </div>
    </section>

    <footer class="footer">
      <a routerLink="/cadastro">Já decidiu? Cadastre seu campo</a>
    </footer>
  `,
  styles: `
    :host {
      display: block;
      font-family: system-ui, -apple-system, sans-serif;
      color: #0f172a;
      background: #ffffff;
    }
    .nav {
      position: sticky;
      top: 0;
      background: rgba(255, 255, 255, 0.9);
      border-bottom: 1px solid #f1f5f9;
      z-index: 10;
    }
    .nav-inner {
      max-width: 72rem;
      margin: 0 auto;
      padding: 1rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      font-weight: 700;
      color: #0c1e4e;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.6rem 1.25rem;
      border-radius: 0.65rem;
      font-weight: 600;
      font-size: 0.9rem;
      text-decoration: none;
      border: none;
      cursor: pointer;
    }
    .btn-primary {
      background: #0c1e4e;
      color: white;
    }
    .btn-accent {
      background: #b45309;
      color: white;
    }
    .btn-outline {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.4);
      color: inherit;
    }
    .btn.full {
      width: 100%;
      margin-top: 1rem;
    }
    .hero {
      background: linear-gradient(135deg, #0c1e4e, #1e3a8a);
      color: white;
      text-align: center;
      padding: 4rem 1.25rem 5rem;
    }
    .hero h1 {
      font-size: clamp(1.75rem, 4vw, 2.75rem);
      max-width: 48rem;
      margin: 0 auto 1.25rem;
    }
    .hero em {
      color: #fbbf24;
      font-style: normal;
    }
    .hero p {
      max-width: 40rem;
      margin: 0 auto 2rem;
      color: #dbeafe;
    }
    .badge {
      display: inline-block;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.3rem 0.8rem;
      border-radius: 999px;
      margin-bottom: 1.25rem;
    }
    .hero-ctas {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
      flex-wrap: wrap;
      margin-bottom: 2rem;
    }
    .hero-facts {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      justify-content: center;
      padding: 0;
      font-size: 0.85rem;
      color: #bfdbfe;
    }
    section {
      max-width: 72rem;
      margin: 0 auto;
      padding: 4rem 1.25rem;
    }
    .pains {
      background: #f8fafc;
    }
    h2 {
      text-align: center;
      font-size: 1.75rem;
      color: #0c1e4e;
      margin-bottom: 0.5rem;
    }
    .muted {
      text-align: center;
      color: #64748b;
      margin-bottom: 2.5rem;
    }
    .grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .card {
      border: 1px solid #f1f5f9;
      border-radius: 0.9rem;
      padding: 1.25rem;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      font-size: 0.9rem;
    }
    .card h3 {
      margin: 0 0 0.4rem;
      font-size: 0.95rem;
      color: #0f172a;
    }
    .card p {
      margin: 0;
      color: #64748b;
      font-size: 0.85rem;
    }
    .toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      margin-bottom: 2.5rem;
      font-weight: 600;
      color: #94a3b8;
    }
    .toggle .active {
      color: #0c1e4e;
    }
    .toggle button {
      width: 3.25rem;
      height: 1.75rem;
      border-radius: 999px;
      background: #0c1e4e;
      border: none;
      position: relative;
      cursor: pointer;
    }
    .toggle .dot {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 1.4rem;
      height: 1.4rem;
      border-radius: 999px;
      background: white;
      transition: transform 0.2s;
    }
    .toggle .dot.right {
      transform: translateX(1.5rem);
    }
    .plan-card {
      max-width: 26rem;
      margin: 0 auto;
      border: 2px solid #0c1e4e;
      border-radius: 1.25rem;
      padding: 2rem;
      text-align: center;
      position: relative;
    }
    .plan-tag {
      position: absolute;
      top: -0.9rem;
      left: 50%;
      transform: translateX(-50%);
      background: #b45309;
      color: white;
      font-size: 0.7rem;
      text-transform: uppercase;
      padding: 0.3rem 0.9rem;
      border-radius: 999px;
      white-space: nowrap;
    }
    .plan-scope {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      color: #0c1e4e;
      background: #eff6ff;
      padding: 0.3rem 0.8rem;
      border-radius: 999px;
      margin: 1rem 0;
    }
    .price {
      font-size: 2.75rem;
      font-weight: 800;
      color: #0c1e4e;
      margin: 0;
    }
    .price small {
      font-size: 1rem;
      font-weight: 500;
      color: #94a3b8;
    }
    .small {
      font-size: 0.75rem;
    }
    .plan-items {
      list-style: none;
      text-align: left;
      padding: 0;
      margin: 1.5rem 0 0;
      font-size: 0.85rem;
      color: #334155;
    }
    .plan-items li {
      padding: 0.3rem 0;
    }
    .plan-items li::before {
      content: '✓ ';
      color: #16a34a;
      font-weight: 700;
    }
    .footer {
      text-align: center;
      padding: 2.5rem 1.25rem 4rem;
    }
    .footer a {
      color: #0c1e4e;
      font-weight: 600;
      text-decoration: none;
    }
  `,
})
export class PricingPage {
  readonly annual = signal(false);
  readonly whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

  readonly pains = [
    'Planilha de membros desatualizada, sem backup e só uma pessoa sabe mexer.',
    'Carteirinha impressa que ninguém confere e custa toda vez que precisa reimprimir.',
    'Dízimo e oferta lançados de cabeça, sem comprovante nem relatório pra prestar contas.',
    'Cada congregação nova é mais uma planilha solta, sem visão geral da obra toda.',
  ];

  readonly features = [
    { title: 'Gestão de Membros', description: 'Toda a informação de cada membro num só lugar — sem planilha, sem duplicidade.' },
    { title: 'Congregações Ilimitadas', description: 'Sua rede cresce e a mensalidade continua a mesma.' },
    { title: 'Cadastro em Massa', description: 'O novo membro se cadastra sozinho, com foto — sua secretaria não digita nada.' },
    { title: 'Tesouraria', description: 'Prestação de contas pronta a qualquer momento, sem fechar caixa no papel.' },
    { title: 'Carteirinhas Digitais', description: 'Emite na hora e valida na hora com QR Code.' },
    { title: 'Departamentos e Ministério', description: 'Cada líder cuida do seu departamento, com controle de obreiros e consagrações.' },
    { title: 'Projetos com Transparência', description: 'Mostra o andamento de cada obra, em tempo real.' },
    { title: 'Auditoria Completa', description: 'Sempre sabe quem fez o quê e quando.' },
  ];

  readonly planItems = [
    'Congregações e membros ilimitados',
    'Cadastro em massa com foto, via link público',
    'Tesouraria completa + comprovante de dízimo',
    'Carteirinhas digitais com QR Code',
    'Departamentos, ministério e obreiros',
    'Relatórios em PDF e Excel',
  ];
}

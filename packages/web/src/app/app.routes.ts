import { Route } from '@angular/router';
import { PricingPage } from './pricing/pricing';
import { OnboardingPage } from './onboarding/onboarding';

export const appRoutes: Route[] = [
  { path: '', redirectTo: 'planos', pathMatch: 'full' },
  { path: 'planos', component: PricingPage },
  { path: 'cadastro', component: OnboardingPage },
];

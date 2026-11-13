import { SetMetadata } from '@nestjs/common';
import { AppAbility } from './casl-ability.factory';

export const CHECK_POLICIES_KEY = 'check_policies';

export type PolicyHandlerCallback = (ability: AppAbility) => boolean;
export type PolicyHandler = PolicyHandlerCallback | { handle: PolicyHandlerCallback };

export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);

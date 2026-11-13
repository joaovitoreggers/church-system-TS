import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsString } from 'class-validator';
import { TenantsService } from './tenants.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token.types';
import { CheckPolicies } from '../casl/check-policies.decorator';

class UpdateCardThemeDto {
  @IsString()
  theme!: string;
}

@Controller('tenants/me')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get('card-theme')
  getCardTheme(@CurrentUser() user: AccessTokenPayload) {
    return this.tenants.getCardTheme(user);
  }

  @Patch('card-theme')
  @CheckPolicies((ability) => ability.can('manage', 'tenant'))
  updateCardTheme(@CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateCardThemeDto) {
    return this.tenants.updateCardTheme(user, dto.theme);
  }
}

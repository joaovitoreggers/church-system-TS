import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/token.types';
import { CheckPolicies } from '../casl/check-policies.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ── Próprio perfil — SEMPRE a partir do JWT (@CurrentUser), nunca de
  // um :id na rota. Rotas /me ficam antes de /:id só por legibilidade;
  // o Nest já resolve por ordem de declaração, mas "me" nunca colide com
  // um id de verdade (os ids são cuid, nunca a string literal "me"). ──
  @Get('me')
  getMe(@CurrentUser() user: AccessTokenPayload) {
    return this.users.getMe(user);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(user, dto);
  }

  @Post('me/signature')
  @UseInterceptors(FileInterceptor('signature'))
  uploadSignature(@CurrentUser() user: AccessTokenPayload, @UploadedFile() file: Express.Multer.File) {
    return this.users.uploadSignature(user, { buffer: file.buffer, mimetype: file.mimetype });
  }

  @Delete('me/signature')
  deleteSignature(@CurrentUser() user: AccessTokenPayload) {
    return this.users.deleteSignature(user);
  }

  // ── Gestão de usuários do tenant ────────────────────────────────────
  @Get()
  @CheckPolicies((ability) => ability.can('manage', 'users'))
  list() {
    return this.users.list();
  }

  @Post()
  @CheckPolicies((ability) => ability.can('manage', 'users'))
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }

  @Patch(':id/deactivate')
  @CheckPolicies((ability) => ability.can('manage', 'users'))
  deactivate(@Param('id') id: string) {
    return this.users.deactivate(id);
  }
}

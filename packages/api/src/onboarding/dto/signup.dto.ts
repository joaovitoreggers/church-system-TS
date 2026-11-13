import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupDto {
  // ─── Dados do tenant (equivalente ao cadastro_step1 do Django) ─────────
  @IsString()
  @MinLength(2)
  tenantName!: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pastorPresidente?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  // ─── Dados do usuário administrador (cadastro_step2) ───────────────────
  @IsEmail()
  adminEmail!: string;

  @IsOptional()
  @IsString()
  adminFirstName?: string;

  @IsOptional()
  @IsString()
  adminLastName?: string;

  @IsString()
  @MinLength(6)
  adminPassword!: string;
}

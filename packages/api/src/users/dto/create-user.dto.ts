import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  // IDs de Role do PRÓPRIO tenant — nunca confiar nisso direto: o service
  // só atribui os que a leitura tenant-scoped (RLS) de fato devolver pra
  // este tenant, e rejeita a requisição inteira se algum id não voltar
  // (mesma regra anti-IDOR do resto do sistema: nunca aceitar um recurso
  // de outro tenant só porque o cliente mandou o id).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}

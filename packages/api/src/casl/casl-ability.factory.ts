import { Injectable } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';

export type AppAbility = MongoAbility;

export interface AbilityUser {
  isSuperuser: boolean;
  isTenantAdmin: boolean;
  /** Permissões efetivas do usuário, já resolvidas (união de todos os Role.permissions). Strings "subject.action". */
  permissions: string[];
}

@Injectable()
export class CaslAbilityFactory {
  defineAbilitiesFor(user: AbilityUser): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    if (user.isSuperuser || user.isTenantAdmin) {
      // isTenantAdmin também cai em "manage all": as policies de RLS já
      // limitam o acesso ao próprio tenant de qualquer forma — não precisa
      // (e não teria como, de forma dinâmica) listar aqui todo subject que
      // um admin de tenant deve poder gerenciar.
      can('manage', 'all');
      return build();
    }

    for (const permission of user.permissions) {
      const [subject, action] = permission.split('.');
      if (subject && action) {
        can(action, subject);
      }
    }

    return build();
  }
}

import { CaslAbilityFactory } from './casl-ability.factory';

describe('CaslAbilityFactory', () => {
  const factory = new CaslAbilityFactory();

  it('superuser pode gerenciar tudo', () => {
    const ability = factory.defineAbilitiesFor({
      isSuperuser: true,
      isTenantAdmin: false,
      permissions: [],
    });
    expect(ability.can('delete', 'Member')).toBe(true);
    expect(ability.can('manage', 'QualquerCoisaFutura')).toBe(true);
  });

  it('admin do tenant pode gerenciar tudo (RLS ainda limita ao próprio tenant)', () => {
    const ability = factory.defineAbilitiesFor({
      isSuperuser: false,
      isTenantAdmin: true,
      permissions: [],
    });
    expect(ability.can('delete', 'Member')).toBe(true);
  });

  it('usuário comum só pode o que as permissões concedem', () => {
    const ability = factory.defineAbilitiesFor({
      isSuperuser: false,
      isTenantAdmin: false,
      permissions: ['members.view', 'treasury.create'],
    });
    expect(ability.can('view', 'members')).toBe(true);
    expect(ability.can('create', 'treasury')).toBe(true);
    expect(ability.can('delete', 'members')).toBe(false);
    expect(ability.can('view', 'treasury')).toBe(false);
  });

  it('usuário sem nenhuma permissão não pode nada', () => {
    const ability = factory.defineAbilitiesFor({
      isSuperuser: false,
      isTenantAdmin: false,
      permissions: [],
    });
    expect(ability.can('view', 'members')).toBe(false);
  });
});

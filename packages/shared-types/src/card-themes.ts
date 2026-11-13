/**
 * Paletas de cores dos modelos de carteirinha de membro. Fonte única de
 * verdade, compartilhada entre a API (geração do PDF da carteirinha, a
 * partir do Sprint 6) e o Angular (preview do seletor) — porte direto de
 * `campos/card_themes.py` do sistema Django original, mesmas 9 chaves e
 * mesmos valores em hex, pra não perder nenhum modelo na migração.
 */
export interface CardPalette {
  label: string;
  bg: string;
  heading: string;
  secondary: string;
  accent: string;
  accentMuted: string;
  photoPlaceholder: string;
}

export const CARD_PALETTES: Record<string, CardPalette> = {
  navy: {
    label: 'Azul-Marinho',
    bg: '#002449',
    heading: '#ffffff',
    secondary: '#adccf5',
    accent: '#f0c832',
    accentMuted: '#997d1a',
    photoPlaceholder: '#1e61c3',
  },
  maroon: {
    label: 'Vinho',
    bg: '#320101',
    heading: '#ffffff',
    secondary: '#e8bfbf',
    accent: '#f0c832',
    accentMuted: '#997d1a',
    photoPlaceholder: '#8c3838',
  },
  brown: {
    label: 'Marrom Dourado',
    bg: '#724d36',
    heading: '#ffffff',
    secondary: '#e8d6c2',
    accent: '#f0c832',
    accentMuted: '#997d1a',
    photoPlaceholder: '#9e7856',
  },
  purple: {
    label: 'Roxo',
    bg: '#14003b',
    heading: '#ffffff',
    secondary: '#d1c2ed',
    accent: '#f0c832',
    accentMuted: '#997d1a',
    photoPlaceholder: '#6b4aa6',
  },
  graphite: {
    label: 'Grafite',
    bg: '#545454',
    heading: '#ffffff',
    secondary: '#dedede',
    accent: '#f0c832',
    accentMuted: '#997d1a',
    photoPlaceholder: '#8c8c8c',
  },
  green: {
    label: 'Verde',
    bg: '#003b1f',
    heading: '#ffffff',
    secondary: '#c2e8d1',
    accent: '#f0c832',
    accentMuted: '#997d1a',
    photoPlaceholder: '#2e8057',
  },
  black: {
    label: 'Preto',
    bg: '#000000',
    heading: '#ffffff',
    secondary: '#cccccc',
    accent: '#f0c832',
    accentMuted: '#997d1a',
    photoPlaceholder: '#4d4d4d',
  },
  cream: {
    label: 'Creme',
    bg: '#fff3ec',
    heading: '#0a123a',
    secondary: '#6b5224',
    accent: '#997d1a',
    accentMuted: '#80664d',
    photoPlaceholder: '#0a123a',
  },
  coffee: {
    label: 'Café',
    bg: '#603a22',
    heading: '#ffffff',
    secondary: '#e8d1b8',
    accent: '#f0c832',
    accentMuted: '#997d1a',
    photoPlaceholder: '#8f613d',
  },
};

export type CardThemeKey = keyof typeof CARD_PALETTES;

export const CARD_THEME_KEYS = Object.keys(CARD_PALETTES) as CardThemeKey[];

export const DEFAULT_CARD_THEME: CardThemeKey = 'navy';

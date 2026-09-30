import { Zone } from '@/models/Card'

export type ZoneSlug = 'attack' | 'midfield' | 'defense'

/**
 * Centralized metadata for every zone.
 *
 * Adding a new zone requires adding an entry here plus the matching CSS
 * variables/classes. The rest of the application (components, store, PDF
 * renderer) reads this configuration instead of hard-coding zone values.
 */
export interface ZoneTheme {
  zone: Zone
  slug: ZoneSlug
  /** Human readable label shown in UI and on printed cards. */
  label: string
  /** One-line explanation of the theme shown in the editor. */
  description: string
  /** CSS class applied to the card root and badges. */
  className: string
  /** Main zone colour. */
  primary: string
  primaryDark: string
  primaryDeep: string
  primaryLight: string
  /** Highlight colour used for accents such as the stat values. */
  accent: string
  accentSoft: string
  /** Card background gradient endpoints (dark, premium look). */
  gradientFrom: string
  gradientTo: string
  /** Panel colour used for the action and stat boxes. */
  panel: string
  panelBorder: string
  /** Text colours on top of the themed background. */
  ink: string
  inkMuted: string
  /** Zone badge colours. */
  badgeBackground: string
  badgeText: string
}

export const zoneConfig: Record<Zone, ZoneTheme> = {
  [Zone.ATTACK]: {
    zone: Zone.ATTACK,
    slug: 'attack',
    label: 'Attack',
    description: 'Aggressive red theme for frontline fighters.',
    className: 'zone-attack',
    primary: '#e0352b',
    primaryDark: '#a11a1a',
    primaryDeep: '#4a0d0d',
    primaryLight: '#ff7a6b',
    accent: '#ffb545',
    accentSoft: '#ffdca8',
    gradientFrom: '#4a1410',
    gradientTo: '#160708',
    panel: 'rgba(224, 53, 43, 0.16)',
    panelBorder: 'rgba(255, 122, 107, 0.38)',
    ink: '#fdf3e7',
    inkMuted: '#e9c7b4',
    badgeBackground: 'rgba(255, 181, 69, 0.18)',
    badgeText: '#ffdca8',
  },
  [Zone.MIDFIELD]: {
    zone: Zone.MIDFIELD,
    slug: 'midfield',
    label: 'Midfield',
    description: 'Balanced green theme for strategists and supports.',
    className: 'zone-midfield',
    primary: '#16a34a',
    primaryDark: '#0b6b33',
    primaryDeep: '#06391d',
    primaryLight: '#5ee993',
    accent: '#ffd54a',
    accentSoft: '#ffefa8',
    gradientFrom: '#0f3d24',
    gradientTo: '#06150e',
    panel: 'rgba(22, 163, 74, 0.16)',
    panelBorder: 'rgba(94, 233, 147, 0.34)',
    ink: '#f0fdf4',
    inkMuted: '#b9e6c8',
    badgeBackground: 'rgba(255, 213, 74, 0.18)',
    badgeText: '#ffefa8',
  },
  [Zone.DEFENSE]: {
    zone: Zone.DEFENSE,
    slug: 'defense',
    label: 'Defense',
    description: 'Sturdy blue theme for guardians and sentinels.',
    className: 'zone-defense',
    primary: '#2563eb',
    primaryDark: '#1a44a8',
    primaryDeep: '#0a2154',
    primaryLight: '#7fb2ff',
    accent: '#67e8f9',
    accentSoft: '#c9f4ff',
    gradientFrom: '#12305e',
    gradientTo: '#060f24',
    panel: 'rgba(37, 99, 235, 0.16)',
    panelBorder: 'rgba(127, 178, 255, 0.34)',
    ink: '#f0f6ff',
    inkMuted: '#bcd2f0',
    badgeBackground: 'rgba(103, 232, 249, 0.16)',
    badgeText: '#c9f4ff',
  },
}

export const zoneOptions: ZoneTheme[] = [
  zoneConfig[Zone.ATTACK],
  zoneConfig[Zone.MIDFIELD],
  zoneConfig[Zone.DEFENSE],
]

export function getZoneTheme(zone: Zone): ZoneTheme {
  return zoneConfig[zone] ?? zoneConfig[Zone.ATTACK]
}

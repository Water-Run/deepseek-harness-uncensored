/** Mode identity tones: the built-in presets own a color, everything else stays neutral. */

/** Card tone for one preset id. */
export type ModeTone = 'standard' | 'security' | 'reverse' | 'writing' | 'neutral'

const MODE_TONES: Readonly<Record<string, ModeTone>> = {
  standard: 'standard', security: 'security', reverse: 'reverse', writing: 'writing',
}

/**
 * Read the color identity of a preset.
 * @param id - preset id recorded by a Session, or absent while unknown.
 * @returns the card tone; legacy and custom presets share the neutral one.
 */
export function modeTone(id: string | null | undefined): ModeTone {
  return (typeof id === 'string' ? MODE_TONES[id] : undefined) ?? 'neutral'
}

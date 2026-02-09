/**
 * Centralized Anthropic model configuration for all Rise AI surfaces.
 * Use env overrides when needed, but default the app to Opus 4.6.
 */
export const ANTHROPIC_OPUS_MODEL =
  process.env.ANTHROPIC_MODEL_OPUS ||
  process.env.ANTHROPIC_MODEL ||
  'claude-opus-4-6'

export const ANTHROPIC_SONNET_MODEL =
  process.env.ANTHROPIC_MODEL_SONNET ||
  'claude-sonnet-4-20250514'

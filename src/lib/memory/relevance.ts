const LOW_SIGNAL_EXACT = new Set([
  'ok',
  'okay',
  'cool',
  'nice',
  'great',
  'sounds good',
  'thanks',
  'thank you',
  'got it',
])

const LOW_SIGNAL_PATTERNS: RegExp[] = [
  /^(hi|hello|hey)\b[.!?]*$/i,
  /^(sounds good|looks good|all good|makes sense)\b[.!?]*$/i,
  /^(this is|that is)\s+(just\s+)?(the\s+)?opening of (a|the) conversation/i,
  /user said ["']?ok(?:ay)?["']?/i,
  /assistant (?:responded|greeted|said hello)/i,
  /small talk/i,
  /generic greeting/i,
]

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function uniqueTokenSet(text: string): Set<string> {
  const tokens = tokenize(text).filter(token => token.length > 2)
  return new Set(tokens)
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let overlap = 0
  for (const token of a) {
    if (b.has(token)) overlap += 1
  }
  const union = a.size + b.size - overlap
  return union === 0 ? 0 : overlap / union
}

export function normalizeMemoryText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
}

export function memorySignature(value: string): string {
  const normalized = normalizeMemoryText(value).toLowerCase()
  const nameMatch = normalized.match(/\b(?:my|user(?:'s)?|their)\s+name\s+is\s+([a-z][a-z0-9-]*)/)
  if (nameMatch?.[1]) {
    return `name:${nameMatch[1]}`
  }

  return normalized
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function areNearDuplicateMemories(a: string, b: string): boolean {
  const normalizedA = normalizeMemoryText(a)
  const normalizedB = normalizeMemoryText(b)
  if (!normalizedA || !normalizedB) return false

  const signatureA = memorySignature(normalizedA)
  const signatureB = memorySignature(normalizedB)
  if (!signatureA || !signatureB) return false
  if (signatureA === signatureB) return true

  if (signatureA.length > 18 && signatureB.length > 18) {
    if (signatureA.includes(signatureB) || signatureB.includes(signatureA)) {
      return true
    }
  }

  const similarity = jaccardSimilarity(uniqueTokenSet(signatureA), uniqueTokenSet(signatureB))
  return similarity >= 0.82
}

export function isLikelyRelevantMemory(value: string): boolean {
  const normalized = normalizeMemoryText(value)
  if (!normalized) return false

  const lower = normalized.toLowerCase()
  if (LOW_SIGNAL_EXACT.has(lower)) return false
  if (LOW_SIGNAL_PATTERNS.some(pattern => pattern.test(normalized))) return false

  const tokens = tokenize(normalized)
  if (tokens.length <= 2 && normalized.length < 18) return false

  const meaningfulTokens = tokens.filter(token => token.length > 2)
  if (meaningfulTokens.length < 2 && normalized.length < 26) return false

  return true
}

export function isLikelyRelevantProfileFact(value: string): boolean {
  const normalized = normalizeMemoryText(value)
  if (!isLikelyRelevantMemory(normalized)) return false

  const lower = normalized.toLowerCase()
  if (/\b(?:my|user(?:'s)?|their)\s+name\s+is\b/.test(lower)) return true
  if (/\b(i|my|me|user|they|their)\b/.test(lower)) return true

  const tokens = tokenize(normalized)
  return tokens.length >= 5
}

export function isLikelyRelevantInsight(value: string, importance = 5): boolean {
  const normalized = normalizeMemoryText(value)
  if (!isLikelyRelevantMemory(normalized)) return false
  if (importance >= 7) return true

  const lower = normalized.toLowerCase()
  if (/\b(decided|decision|blocked|blocker|prefers|preference|goal|constraint|risk|stuck|problem)\b/.test(lower)) {
    return true
  }

  return tokenize(normalized).length >= 6
}

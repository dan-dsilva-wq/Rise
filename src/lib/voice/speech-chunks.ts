const CHUNK_MAX_CHARS = 420

function cleanWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function splitByWords(text: string, maxChars: number): string[] {
  const words = text.split(' ').filter(Boolean)
  const chunks: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }

    if (current) chunks.push(current)
    current = word
  }

  if (current) chunks.push(current)
  return chunks
}

function splitSentence(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence]

  const clauseParts = sentence
    .split(/(?<=[,;:])\s+/)
    .map(part => part.trim())
    .filter(Boolean)

  if (clauseParts.length <= 1) {
    return splitByWords(sentence, maxChars)
  }

  const chunks: string[] = []
  let current = ''
  for (const clause of clauseParts) {
    if (clause.length > maxChars) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      chunks.push(...splitByWords(clause, maxChars))
      continue
    }

    const candidate = current ? `${current} ${clause}` : clause
    if (candidate.length <= maxChars) {
      current = candidate
    } else {
      if (current) chunks.push(current)
      current = clause
    }
  }

  if (current) chunks.push(current)
  return chunks
}

export function buildSpeechChunks(text: string, maxChars = CHUNK_MAX_CHARS): string[] {
  const cleaned = cleanWhitespace(text)
  if (!cleaned) return []

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(part => part.trim())
    .filter(Boolean)

  if (sentences.length === 0) {
    return splitByWords(cleaned, maxChars)
  }

  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      chunks.push(...splitSentence(sentence, maxChars))
      continue
    }

    const candidate = current ? `${current} ${sentence}` : sentence
    if (candidate.length <= maxChars) {
      current = candidate
    } else {
      if (current) chunks.push(current)
      current = sentence
    }
  }

  if (current) chunks.push(current)
  return chunks
}

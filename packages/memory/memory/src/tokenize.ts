/**
 * Language-neutral tokenization for memory search. Latin words are tokens of
 * their own; Han, Hiragana, Katakana, and Hangul text becomes characters plus
 * adjacent character pairs, so a Chinese query matches without a dictionary
 * or a paid segmentation service. Bigrams carry more weight than single
 * characters because they pin down more of the phrase.
 * @module @deepseek-ai/dsh-memory/src/tokenize
 */

/** Weight of one CJK character token. */
const CJK_CHAR_WEIGHT = 1
/** Weight of one adjacent CJK character pair. */
const CJK_PAIR_WEIGHT = 1.6
/** Weight of one Latin/digit word token. */
const WORD_WEIGHT = 2

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const WORD_CHARACTER = /[\p{L}\p{N}]/u
const HAS_DIGIT = /\d/u

/**
 * Normalize text for matching: compatibility-normalized, lowercased, and with
 * every whitespace run collapsed so a line break never splits a phrase.
 * @param text - raw stored or queried text.
 * @returns the normalized form used for both tokens and digests.
 */
export function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()
}

/**
 * Tokenize text into weighted terms. Each distinct term appears once, with
 * the highest weight any occurrence produced.
 * @param text - raw text to tokenize.
 * @returns term to weight, empty for text with no letters or digits.
 */
export function tokenize(text: string): Map<string, number> {
  const tokens = new Map<string, number>()
  const normalized = normalizeText(text)
  let run: string[] = []
  let cjkRun = false

  const weigh = (term: string, weight: number): void => {
    const previous = tokens.get(term)
    if (previous === undefined || previous < weight) tokens.set(term, weight)
  }

  const flush = (): void => {
    if (run.length === 0) return
    if (cjkRun) {
      for (const character of run) weigh(character, CJK_CHAR_WEIGHT)
      for (let index = 1; index < run.length; index += 1) {
        weigh(`${run[index - 1]}${run[index]}`, CJK_PAIR_WEIGHT)
      }
    } else {
      const word = run.join('')
      // Single Latin letters ("a", "I") carry no retrieval signal; a digit does.
      if (word.length >= 2 || HAS_DIGIT.test(word)) weigh(word, WORD_WEIGHT)
    }
    run = []
  }

  for (const character of normalized) {
    if (CJK.test(character)) {
      if (!cjkRun) flush()
      cjkRun = true
      run.push(character)
    } else if (WORD_CHARACTER.test(character)) {
      if (cjkRun) flush()
      cjkRun = false
      run.push(character)
    } else {
      flush()
    }
  }
  flush()
  return tokens
}

/**
 * Measure how much of a query's token weight one tokenized text matches.
 * @param query - tokenized query.
 * @param document - tokenized candidate text.
 * @returns the matched share in `[0, 1]`; `0` when the query has no tokens.
 */
export function relevanceOf(query: ReadonlyMap<string, number>, document: ReadonlyMap<string, number>): number {
  let matched = 0
  let total = 0
  for (const [term, weight] of query) {
    total += weight
    if (document.has(term)) matched += weight
  }
  return total === 0 ? 0 : matched / total
}

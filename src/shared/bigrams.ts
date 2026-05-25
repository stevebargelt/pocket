// Key / bigram extraction over the EXPECTED character stream.
//
// Units are keyed on the literal expected character: 'T' and 't' are distinct,
// and space is a real key. A bigram is two consecutive expected characters in
// the presented text. The generator selects corpus lines with `containsBigram`,
// which agrees exactly with `extractBigrams` membership — so the engine's
// extraction and the generator's selection can never disagree.

/** Every expected character, in order (literal; space included). */
export function extractKeys(expectedText: string): string[] {
  return Array.from(expectedText);
}

/** Build the canonical two-character bigram unit. */
export function bigramOf(first: string, second: string): string {
  return first + second;
}

/** Every consecutive pair of expected characters. Length == text length - 1. */
export function extractBigrams(expectedText: string): string[] {
  const chars = Array.from(expectedText);
  const out: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) {
    out.push(bigramOf(chars[i], chars[i + 1]));
  }
  return out;
}

/** True iff `bigram` occurs as consecutive characters in `text`. */
export function containsBigram(text: string, bigram: string): boolean {
  return text.includes(bigram);
}

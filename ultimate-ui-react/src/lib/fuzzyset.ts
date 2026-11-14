/**
 * FuzzySet implementation for EPG channel matching.
 * Ported verbatim from the original fuzzyset.js.
 */
export class FuzzySet {
  private exactSet: Record<string, [number, number]> = {};
  private matchDict: Record<string, [number, number][]> = {};
  private items: Record<string, [string, number]> = {};
  private useLevenshtein: boolean;
  private gramSizeLower: number;
  private gramSizeUpper: number;

  constructor(
    arr?: string[],
    useLevenshtein = true,
    gramSizeLower = 2,
    gramSizeUpper = 3
  ) {
    this.useLevenshtein = useLevenshtein;
    this.gramSizeLower = gramSizeLower;
    this.gramSizeUpper = gramSizeUpper;
    if (arr) arr.forEach((item) => this.add(item));
  }

  add(value: string): void {
    const normalized = this.normalize(value);
    if (this.items[normalized]) return;

    const index = Object.keys(this.items).length;
    this.items[normalized] = [value, 0];
    this.exactSet[normalized] = [index, 0];

    const gramCount = this.gramSizeUpper - this.gramSizeLower + 1;
    for (let gs = this.gramSizeLower; gs <= this.gramSizeUpper; gs++) {
      const grams = this.gramify(normalized, gs);
      grams.forEach((gram) => {
        if (!this.matchDict[gram]) this.matchDict[gram] = [];
        this.matchDict[gram].push([index, gramCount]);
      });
    }
  }

  get(value: string): [number, string][] {
    const normalized = this.normalize(value);
    if (this.exactSet[normalized]) {
      return [[1.0, this.items[normalized][0]]];
    }

    const results: [number, string][] = [];
    const gramResults: Record<number, number> = {};
    const minGram = this.gramSizeLower;
    const maxGram = this.gramSizeUpper;

    for (let gs = minGram; gs <= maxGram; gs++) {
      const grams = this.gramify(normalized, gs);
      grams.forEach((gram) => {
        if (this.matchDict[gram]) {
          this.matchDict[gram].forEach(([index, gramCount]) => {
            if (!gramResults[index]) gramResults[index] = 0;
            gramResults[index] += 1 / gramCount;
          });
        }
      });
    }

    Object.keys(gramResults).forEach((index) => {
      const idx = Number(index);
      const score = gramResults[idx] / this.gramify(normalized, 2).length;
      if (score > 0) {
        results.push([score, this.items[Object.keys(this.items)[idx]][0]]);
      }
    });

    results.sort((a, b) => b[0] - a[0]);

    if (this.useLevenshtein && results.length > 0) {
      results.forEach((result) => {
        const normalizedItem = this.normalize(result[1]);
        const distance = this.levenshtein(normalized, normalizedItem);
        const maxLen = Math.max(normalized.length, normalizedItem.length);
        result[0] = 1 - distance / maxLen;
      });
      results.sort((a, b) => b[0] - a[0]);
    }

    return results.slice(0, 5);
  }

  private normalize(str: string): string {
    return str.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private gramify(str: string, gramSize: number): string[] {
    const normalized = this.normalize(str);
    const grams: string[] = [];
    for (let i = 0; i < normalized.length - gramSize + 1; i++) {
      grams.push(normalized.substring(i, i + gramSize));
    }
    return grams;
  }

  private levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[b.length][a.length];
  }
}

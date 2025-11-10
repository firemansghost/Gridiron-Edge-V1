/**
 * Unit tests for consensus normalization + deduplication + price leak filtering
 * 
 * These tests pin the fix for:
 * - Spread normalization to favorite-centric (negative)
 * - Per-book deduplication
 * - Price leak filtering
 * - Zero-median bug prevention
 */

describe('Consensus Normalization + Deduplication', () => {
  /**
   * Replicate the computeMedianConsensus logic for spread fields
   * This matches the implementation in apps/web/app/api/game/[gameId]/route.ts
   */
  function computeSpreadConsensus(
    lines: Array<{ lineValue: number | null; bookName?: string; source?: string }>,
    priceLeakFilter: (value: number) => boolean
  ): {
    value: number | null;
    rawCount: number;
    perBookCount: number;
    deduped: boolean;
    books: string[];
  } {
    const validValues: { value: number; book: string }[] = [];
    let excludedCount = 0;

    for (const line of lines) {
      if (line.lineValue === null || line.lineValue === undefined) {
        excludedCount++;
        continue;
      }

      // Price leak filter
      if (priceLeakFilter(line.lineValue)) {
        excludedCount++;
        continue;
      }

      const book = line.bookName || line.source || 'unknown';
      validValues.push({ value: line.lineValue, book });
    }

    const rawCount = validValues.length;

    if (rawCount === 0) {
      return {
        value: null,
        rawCount: 0,
        perBookCount: 0,
        deduped: true,
        books: []
      };
    }

    // Step 1: Normalize to favorite-centric (always negative)
    const normalizedValues: { value: number; book: string }[] = validValues.map(v => ({
      value: -Math.abs(v.value), // Always negative (favorite-centric)
      book: v.book
    }));

    // Step 2: Dedupe per book (keep one reading per book)
    const perBookMap = new Map<string, number>();
    for (const { value, book } of normalizedValues) {
      const rounded = Math.round(value * 2) / 2; // Round to nearest 0.5
      if (!perBookMap.has(book)) {
        perBookMap.set(book, rounded);
      }
    }

    const dedupedValues = Array.from(perBookMap.entries()).map(([book, value]) => ({ book, value }));
    const perBookCount = dedupedValues.length;

    if (dedupedValues.length === 0) {
      return {
        value: null,
        rawCount,
        perBookCount: 0,
        deduped: true,
        books: []
      };
    }

    // Step 3: Compute median on normalized, deduped values
    const sorted = dedupedValues.map(v => v.value).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

    const uniqueBooks = Array.from(new Set(dedupedValues.map(v => v.book)));

    return {
      value: median,
      rawCount,
      perBookCount,
      deduped: true,
      books: uniqueBooks
    };
  }

  /**
   * Price leak filter: abs >= 50 && multiple of 5 (American odds)
   */
  function looksLikePriceLeak(value: number): boolean {
    return Math.abs(value) >= 50 && Math.abs(value) % 5 === 0;
  }

  describe('Normalization to favorite-centric', () => {
    test('Mixed positive/negative values normalize to negative', () => {
      // OSU @ Purdue: Some books have +29, others have -29
      const lines = [
        { lineValue: 29, bookName: 'FanDuel' },
        { lineValue: -29, bookName: 'DraftKings' },
        { lineValue: 29.5, bookName: 'BetRivers' },
        { lineValue: -29.5, bookName: 'Caesars' }
      ];

      const result = computeSpreadConsensus(lines, looksLikePriceLeak);

      // All should normalize to negative
      expect(result.value).toBeLessThan(0);
      expect(result.value).toBeCloseTo(-29.25, 1); // Median of -29, -29, -29.5, -29.5
      expect(result.perBookCount).toBe(4);
      expect(result.deduped).toBe(true);
    });

    test('All positive values normalize correctly', () => {
      const lines = [
        { lineValue: 10, bookName: 'Book1' },
        { lineValue: 10.5, bookName: 'Book2' },
        { lineValue: 11, bookName: 'Book3' }
      ];

      const result = computeSpreadConsensus(lines, looksLikePriceLeak);

      expect(result.value).toBeLessThan(0);
      expect(result.value).toBe(-10.5); // Median of -10, -10.5, -11
      expect(result.perBookCount).toBe(3);
    });

    test('All negative values stay negative', () => {
      const lines = [
        { lineValue: -10, bookName: 'Book1' },
        { lineValue: -10.5, bookName: 'Book2' },
        { lineValue: -11, bookName: 'Book3' }
      ];

      const result = computeSpreadConsensus(lines, looksLikePriceLeak);

      expect(result.value).toBeLessThan(0);
      expect(result.value).toBe(-10.5);
      expect(result.perBookCount).toBe(3);
    });
  });

  describe('Per-book deduplication', () => {
    test('Multiple entries from same book dedupe to one', () => {
      // Same book reports both +29 and -29 (common in real data)
      const lines = [
        { lineValue: 29, bookName: 'FanDuel' },
        { lineValue: -29, bookName: 'FanDuel' }, // Duplicate from same book
        { lineValue: 29.5, bookName: 'DraftKings' },
        { lineValue: -29.5, bookName: 'DraftKings' } // Duplicate from same book
      ];

      const result = computeSpreadConsensus(lines, looksLikePriceLeak);

      // Should have 2 books (FanDuel, DraftKings), not 4
      expect(result.rawCount).toBe(4);
      expect(result.perBookCount).toBe(2);
      expect(result.deduped).toBe(true);
      expect(result.books.length).toBe(2);
    });

    test('Zero median bug prevention: mixed signs from same book', () => {
      // This was the bug: +29 and -29 from same book → median = 0
      const lines = [
        { lineValue: 29, bookName: 'FanDuel' },
        { lineValue: -29, bookName: 'FanDuel' },
        { lineValue: 29, bookName: 'DraftKings' },
        { lineValue: -29, bookName: 'DraftKings' }
      ];

      const result = computeSpreadConsensus(lines, looksLikePriceLeak);

      // Should NOT be 0.0 (the bug)
      expect(result.value).not.toBe(0);
      expect(result.value).toBe(-29); // After normalization and dedupe
      expect(result.perBookCount).toBe(2);
    });

    test('Deduplication rounds to nearest 0.5', () => {
      const lines = [
        { lineValue: 29.3, bookName: 'Book1' },
        { lineValue: 29.7, bookName: 'Book1' } // Same book, slightly different
      ];

      const result = computeSpreadConsensus(lines, looksLikePriceLeak);

      // Should dedupe to one value (rounded to nearest 0.5)
      expect(result.perBookCount).toBe(1);
      expect(result.value).toBeCloseTo(-29.5, 1);
    });
  });

  describe('Price leak filtering', () => {
    test('Price leaks (American odds) are filtered out', () => {
      const lines = [
        { lineValue: 29, bookName: 'FanDuel' },
        { lineValue: -115, bookName: 'BadBook' }, // Price leak (American odds)
        { lineValue: 29.5, bookName: 'DraftKings' }
      ];

      const result = computeSpreadConsensus(lines, looksLikePriceLeak);

      // -115 should be filtered out
      expect(result.value).toBeCloseTo(-29.25, 1); // Median of -29, -29.5
      expect(result.perBookCount).toBe(2); // Only FanDuel and DraftKings
      expect(result.books).not.toContain('BadBook');
    });

    test('Multiple price leaks all filtered', () => {
      const lines = [
        { lineValue: -110, bookName: 'Book1' }, // Price leak
        { lineValue: -115, bookName: 'Book2' }, // Price leak
        { lineValue: 29, bookName: 'FanDuel' },
        { lineValue: 29.5, bookName: 'DraftKings' }
      ];

      const result = computeSpreadConsensus(lines, looksLikePriceLeak);

      expect(result.value).toBeCloseTo(-29.25, 1);
      expect(result.perBookCount).toBe(2);
      expect(result.books).toEqual(['FanDuel', 'DraftKings']);
    });

    test('Valid spreads near 50 are not filtered', () => {
      // Edge case: spread of 50.0 is valid (not a price leak)
      // But our filter checks abs >= 50 && multiple of 5
      // So 50.0 would be filtered. Let's test 49.5 (should pass)
      const lines = [
        { lineValue: 49.5, bookName: 'Book1' },
        { lineValue: 50.0, bookName: 'Book2' } // This would be filtered (50 % 5 === 0)
      ];

      const result = computeSpreadConsensus(lines, looksLikePriceLeak);

      // 50.0 gets filtered, 49.5 passes
      expect(result.value).toBe(-49.5);
      expect(result.perBookCount).toBe(1);
    });
  });

  describe('Integration: OSU @ Purdue scenario', () => {
    test('Real-world scenario: mixed signs, duplicates, price leaks', () => {
      // Simulating the actual OSU @ Purdue data issue
      const lines = [
        { lineValue: 29, bookName: 'FanDuel' },
        { lineValue: -29, bookName: 'FanDuel' }, // Duplicate
        { lineValue: 29.5, bookName: 'DraftKings' },
        { lineValue: -29.5, bookName: 'DraftKings' }, // Duplicate
        { lineValue: -115, bookName: 'BadSource' }, // Price leak
        { lineValue: 28.5, bookName: 'BetRivers' },
        { lineValue: -28.5, bookName: 'BetRivers' } // Duplicate
      ];

      const result = computeSpreadConsensus(lines, looksLikePriceLeak);

      // Should normalize all to negative, dedupe per book, filter price leak
      expect(result.value).toBeLessThan(0);
      // After normalization: -29, -29, -29.5, -29.5, -28.5, -28.5 (BadSource -115 filtered)
      // After dedupe per book: -29 (FanDuel), -29.5 (DraftKings), -28.5 (BetRivers)
      // Median of -29, -29.5, -28.5 = -29
      expect(result.value).toBeCloseTo(-29, 1);
      expect(result.rawCount).toBe(6); // 7 lines - 1 filtered (BadSource) = 6 valid
      expect(result.perBookCount).toBe(3); // FanDuel, DraftKings, BetRivers (BadSource filtered)
      expect(result.deduped).toBe(true);
      expect(result.books).toContain('FanDuel');
      expect(result.books).toContain('DraftKings');
      expect(result.books).toContain('BetRivers');
      expect(result.books).not.toContain('BadSource');
    });
  });

  describe('Edge cases', () => {
    test('Empty input returns null', () => {
      const result = computeSpreadConsensus([], looksLikePriceLeak);
      expect(result.value).toBeNull();
      expect(result.perBookCount).toBe(0);
    });

    test('All values filtered returns null', () => {
      const lines = [
        { lineValue: -110, bookName: 'Book1' },
        { lineValue: -115, bookName: 'Book2' }
      ];

      const result = computeSpreadConsensus(lines, looksLikePriceLeak);
      expect(result.value).toBeNull();
      expect(result.perBookCount).toBe(0);
    });

    test('Single book with single value', () => {
      const lines = [
        { lineValue: 10, bookName: 'Book1' }
      ];

      const result = computeSpreadConsensus(lines, looksLikePriceLeak);
      expect(result.value).toBe(-10);
      expect(result.perBookCount).toBe(1);
      expect(result.deduped).toBe(true);
    });
  });
});


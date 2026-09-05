export type TrainedPair = {
  baseProductId: string;
  candidateProductId: string;
  lift: number;
  score: number;
  pairCount: number;
};

/** Item-item lift from confirmed baskets. score is 1..100. */
export function trainCopurchaseModel(baskets: string[][]): TrainedPair[] {
  const cleaned = baskets
    .map((b) => [...new Set(b.filter(Boolean))])
    .filter((b) => b.length >= 2);
  const n = cleaned.length;
  if (n === 0) return [];

  const freq = new Map<string, number>();
  const pairs = new Map<string, { a: string; b: string; count: number }>();
  for (const basket of cleaned) {
    for (const id of basket) freq.set(id, (freq.get(id) ?? 0) + 1);
    for (let i = 0; i < basket.length; i += 1) {
      for (let j = i + 1; j < basket.length; j += 1) {
        const a = basket[i]!;
        const b = basket[j]!;
        const [left, right] = a < b ? [a, b] : [b, a];
        const key = `${left}::${right}`;
        const row = pairs.get(key) ?? { a: left, b: right, count: 0 };
        row.count += 1;
        pairs.set(key, row);
      }
    }
  }

  const out: TrainedPair[] = [];
  for (const row of pairs.values()) {
    const fa = freq.get(row.a) ?? 1;
    const fb = freq.get(row.b) ?? 1;
    const lift = (row.count * n) / (fa * fb);
    const score = Math.max(1, Math.min(100, Math.round(20 * Math.log2(lift + 1e-9) + 40)));
    out.push({
      baseProductId: row.a,
      candidateProductId: row.b,
      lift,
      score,
      pairCount: row.count,
    });
    out.push({
      baseProductId: row.b,
      candidateProductId: row.a,
      lift,
      score,
      pairCount: row.count,
    });
  }
  return out.sort((x, y) => y.score - x.score || y.pairCount - x.pairCount);
}

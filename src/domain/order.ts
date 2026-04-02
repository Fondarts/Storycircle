export function normalizeOrder<T>(
  items: T[],
  getOrder: (item: T) => number,
  setOrder: (item: T, order: number) => T,
): T[] {
  const sorted = [...items].sort((a, b) => getOrder(a) - getOrder(b));
  return sorted.map((item, idx) => setOrder(item, idx));
}

export function reorderByIds<T extends { id: string }>(
  items: T[],
  idsInDesiredOrder: string[],
  setOrder: (item: T, order: number) => T,
): T[] {
  const byId = new Map(items.map((x) => [x.id, x] as const));
  const result: T[] = [];

  for (const id of idsInDesiredOrder) {
    const item = byId.get(id);
    if (item) result.push(item);
  }

  for (const item of items) {
    if (!idsInDesiredOrder.includes(item.id)) result.push(item);
  }

  return result.map((item, idx) => setOrder(item, idx));
}


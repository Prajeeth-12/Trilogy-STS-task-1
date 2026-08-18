export function punctuate(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/[.!?;]$/.test(trimmed)) return trimmed;

  if (/^(who|what|where|when|why|how|is|are|was|were|do|does|did|can|could|will|would|shall|should)/i.test(trimmed)) {
    return trimmed + '?';
  }
  return trimmed + '.';
}

export function isDuplicate(prev: string, current: string): boolean {
  return prev.toLowerCase().trim() === current.toLowerCase().trim();
}

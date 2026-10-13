import { randomLabelColor, type LabelColor, type TitleTagRule } from '../store/app-state';

export interface TitleTag {
  name: string;
  color: LabelColor;
}

export const SUGGESTED_TITLE_TAG_RULES: {
  pattern: string;
  description: string;
  example: string;
}[] = [
  {
    pattern: String.raw`^\w+(?:\s*\([^)]*\))?!?:\s*([A-Z][A-Z0-9]+-\d+)`,
    description: 'Ticket key after a conventional-commit prefix',
    example: 'fix: BACK-1234 handle empty carts',
  },
  {
    pattern: String.raw`\b([A-Z][A-Z0-9]+-\d+)\b`,
    description: 'Ticket key anywhere in the title',
    example: 'Handle empty carts (BACK-1234)',
  },
  {
    pattern: String.raw`^(\w+)(?:\s*\([^)]*\))?!?:`,
    description: 'Conventional-commit type',
    example: 'feat(api): add search',
  },
  {
    pattern: String.raw`^\[([^\]]+)\]`,
    description: 'Bracketed prefix',
    example: '[WIP] add search',
  },
];

const MAX_TAG_LENGTH = 32;
const compiled = new Map<string, RegExp | null>();
function compile(pattern: string): RegExp | null {
  if (!compiled.has(pattern)) {
    try {
      compiled.set(pattern, new RegExp(pattern, 'g'));
    } catch {
      compiled.set(pattern, null);
    }
  }
  return compiled.get(pattern)!;
}

export function titleTags(title: string, rules: TitleTagRule[]): TitleTag[] {
  const names = new Set<string>();
  for (const rule of rules) {
    const regex = compile(rule.pattern);
    if (!regex) continue;
    for (const match of title.matchAll(regex)) {
      const name = (match.slice(1).find((group) => group?.trim()) ?? match[0])
        .trim()
        .slice(0, MAX_TAG_LENGTH);
      if (name) names.add(name);
    }
  }
  return [...names].map((name) => ({ name, color: titleTagColor(name) }));
}

// Hashing the full tag seeds the same generator labels use, so a tag keeps its colour everywhere
// and lands in the label colour band.
export function titleTagColor(name: string): LabelColor {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 0x01000193);
  let seed = hash >>> 0;
  return randomLabelColor(() => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

import type { CreditRole, PersonCredit, Program } from './types';

/** Display order and German label per credit role. */
const ROLES: { key: CreditRole; label: string; personLabel: string }[] = [
  { key: 'directors', label: 'Regie', personLabel: 'Regie' },
  { key: 'presenters', label: 'Moderation', personLabel: 'Moderation' },
  { key: 'actors', label: 'Besetzung', personLabel: 'Schauspieler' },
  { key: 'writers', label: 'Drehbuch', personLabel: 'Drehbuch' },
  { key: 'producers', label: 'Produktion', personLabel: 'Produktion' },
];

/** The cast list of the person lane runs in this order: actors first, then the rest. */
const LANE_ORDER: CreditRole[] = ['actors', 'presenters', 'directors', 'writers', 'producers'];

export interface LanePerson {
  key: string;
  name: string;
  /** Character played, e.g. "Penny". */
  character?: string;
  /** What the person did, e.g. "Schauspieler" or "Regie". */
  role: string;
  image: string;
}

export interface CreditLine {
  label: string;
  value: string;
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Only plain web URLs; anything else is treated as "no portrait". */
function imageUrl(v: unknown): string {
  const s = clean(v);
  return /^https?:\/\//i.test(s) ? s : '';
}

function peopleOf(program: Program, role: CreditRole): PersonCredit[] {
  const list = program.credits?.[role];
  return Array.isArray(list) ? list.filter((p) => p && clean(p.name)) : [];
}

/** People with a portrait: they get a card in the lane. */
export function lanePeople(program: Program): LanePerson[] {
  const seen = new Set<string>();
  const out: LanePerson[] = [];
  for (const key of LANE_ORDER) {
    const role = ROLES.find((r) => r.key === key)!;
    for (const p of peopleOf(program, key)) {
      const image = imageUrl(p.image);
      if (!image) continue;
      const id = clean(p.id) || clean(p.name).toLowerCase();
      if (seen.has(`${key}:${id}`)) continue;
      seen.add(`${key}:${id}`);
      const character = clean(p.character_name);
      out.push({
        key: `${key}:${id}`,
        name: clean(p.name),
        character: character && character !== clean(p.name) ? character : undefined,
        role: role.personLabel,
        image,
      });
    }
  }
  return out;
}

/**
 * Text-only credits ("Regie: A, B"). People shown in the lane are left out so nobody
 * appears twice; roles without structured credits fall back to the plain name strings.
 */
export function textCredits(program: Program): CreditLine[] {
  const lines: CreditLine[] = [];
  for (const { key, label } of ROLES) {
    const structured = peopleOf(program, key);
    let value: string;
    if (structured.length > 0) {
      value = structured
        .filter((p) => !imageUrl(p.image))
        .map((p) => {
          const c = clean(p.character_name);
          return c && c !== clean(p.name) ? `${clean(p.name)} (${c})` : clean(p.name);
        })
        .join(', ');
    } else {
      value = clean(program[key] as unknown);
    }
    if (value) lines.push({ label, value });
  }
  return lines;
}

/** Up to two initials for the placeholder avatar. */
export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters.map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

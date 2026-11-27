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
  /** Portrait URL; empty means the card shows initials instead. */
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

function sameCharacter(character: string, name: string): string | undefined {
  return character && character !== name ? character : undefined;
}

/** Name strings only ("Anna (Rolle), Bob") for roles that have no structured credits. */
function parseNames(value: unknown): { name: string; character?: string }[] {
  return clean(value)
    .split(/,\s*/)
    .map((part) => {
      const m = part.match(/^(.*?)\s*\(([^)]*)\)$/);
      return m ? { name: m[1].trim(), character: clean(m[2]) } : { name: part.trim() };
    })
    .filter((p) => p.name);
}

/** True when at least one person has a portrait. */
function hasPortrait(program: Program): boolean {
  return ROLES.some(({ key }) => peopleOf(program, key).some((p) => imageUrl(p.image)));
}

/**
 * All people of a programme for the lane, in lane order. The lane is used only when at
 * least one portrait exists; then everybody (every role) is in it, people without a
 * portrait with initials. Without any portrait the plain text list is used instead.
 */
export function lanePeople(program: Program): LanePerson[] {
  if (!hasPortrait(program)) return [];
  const seen = new Set<string>();
  const out: LanePerson[] = [];
  for (const key of LANE_ORDER) {
    const role = ROLES.find((r) => r.key === key)!;
    const structured = peopleOf(program, key);
    const people: { id?: string; name: string; character?: string; image: string }[] =
      structured.length > 0
        ? structured.map((p) => ({
            id: clean(p.id),
            name: clean(p.name),
            character: sameCharacter(clean(p.character_name), clean(p.name)),
            image: imageUrl(p.image),
          }))
        : parseNames(program[key] as unknown).map((p) => ({ ...p, image: '' }));
    for (const p of people) {
      const id = p.id || p.name.toLowerCase();
      if (seen.has(`${key}:${id}`)) continue;
      seen.add(`${key}:${id}`);
      out.push({
        key: `${key}:${id}`,
        name: p.name,
        character: p.character,
        role: role.personLabel,
        image: p.image,
      });
    }
  }
  return out;
}

/** Text credits ("Regie: A, B") - only used when there is no portrait at all. */
export function textCredits(program: Program): CreditLine[] {
  if (hasPortrait(program)) return [];
  const lines: CreditLine[] = [];
  for (const { key, label } of ROLES) {
    const structured = peopleOf(program, key);
    let value: string;
    if (structured.length > 0) {
      value = structured
        .map((p) => {
          const c = sameCharacter(clean(p.character_name), clean(p.name));
          return c ? `${clean(p.name)} (${c})` : clean(p.name);
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

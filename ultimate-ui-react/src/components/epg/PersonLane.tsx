import { useState } from 'react';
import type { LanePerson } from '@/lib/people';
import { initials } from '@/lib/people';

function PersonCard({ person }: { person: LanePerson }) {
  const [failed, setFailed] = useState(false);
  const title = [person.name, person.character && `(${person.character})`, person.role]
    .filter(Boolean)
    .join(' ');

  return (
    <li className="person-card" title={title}>
      <div className="person-photo">
        {failed ? (
          <span className="person-initials" aria-hidden="true">
            {initials(person.name)}
          </span>
        ) : (
          <img
            src={person.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <span className="person-name">{person.name}</span>
      {person.character && <span className="person-character">{person.character}</span>}
      <span className="person-role">{person.role}</span>
    </li>
  );
}

/** Horizontally scrollable row of people with portrait, name, character and role. */
export function PersonLane({ people }: { people: LanePerson[] }) {
  if (people.length === 0) return null;
  return (
    <section className="person-lane" aria-label="Mitwirkende">
      <ul className="person-lane-track">
        {people.map((p) => (
          <PersonCard key={p.key} person={p} />
        ))}
      </ul>
    </section>
  );
}

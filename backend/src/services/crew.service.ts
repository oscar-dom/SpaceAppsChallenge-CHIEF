import type { CrewMember, Medication } from '@chief/shared';
import type { Db } from '../db/client.js';
import { getCrew, getFormulary } from '../db/queries.js';
import { NotFoundError } from '../errors/app-error.js';

/** Crew members and the onboard formulary: reference data, loaded once at startup. */
export class CrewService {
  private readonly crew: CrewMember[];
  private readonly formularyItems: Medication[];

  constructor(db: Db) {
    this.crew = getCrew(db);
    this.formularyItems = getFormulary(db);
  }

  list(): CrewMember[] {
    return this.crew;
  }

  get(crewId: string): CrewMember {
    const member = this.crew.find((c) => c.id === crewId);
    if (!member) throw new NotFoundError(`Crew member ${crewId} not found`);
    return member;
  }

  /** The only medication CHIEF may suggest (the agent drops anything else). */
  formulary(): Medication[] {
    return this.formularyItems;
  }
}

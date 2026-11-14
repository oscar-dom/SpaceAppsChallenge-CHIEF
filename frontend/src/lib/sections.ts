import { BODY_SYSTEMS, type BodySystemId } from '@chief/shared';
import type { IconName } from './icons';

/** A workspace section: the crew overview, a crew member's overview, or a body system. */
export type SectionId = 'crew' | 'overview' | BodySystemId;

export interface SectionDef {
  id: SectionId;
  name: string;
  icon: IconName;
}

export const SECTIONS: Record<SectionId, SectionDef> = {
  crew: { id: 'crew', name: 'Crew overview', icon: 'crew' },
  overview: { id: 'overview', name: 'Overview', icon: 'overview' },
  ...(Object.fromEntries(
    BODY_SYSTEMS.map((s) => [s.id, { id: s.id, name: s.label, icon: s.id as IconName }]),
  ) as Record<BodySystemId, SectionDef>),
};

/** Left navigation: the overview plus every body system, in menu order. */
export const NAV_SECTIONS: SectionId[] = ['overview', ...BODY_SYSTEMS.map((s) => s.id)];

export const SYSTEM_IDS: BodySystemId[] = BODY_SYSTEMS.map((s) => s.id);

/** Body map regions and the systems they show. The head shows the worse of two systems. */
export type Region = 'head' | 'eyes' | 'immune' | 'cardio' | 'nutr' | 'blood' | 'msk' | 'rad';

export const REGION_SYSTEMS: Record<Region, BodySystemId[]> = {
  head: ['sleep-cognition', 'behavioral-health'],
  eyes: ['vision'],
  immune: ['immune'],
  cardio: ['cardiovascular'],
  nutr: ['nutrition'],
  blood: ['blood-biochemistry'],
  msk: ['musculoskeletal'],
  rad: ['radiation'],
};

export function regionOf(system: BodySystemId): Region {
  return (Object.keys(REGION_SYSTEMS) as Region[]).find((r) =>
    REGION_SYSTEMS[r].includes(system),
  ) as Region;
}

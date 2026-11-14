/**
 * Body systems monitored by CHIEF. Each one is a section of the left menu.
 * `overview` is the first menu entry but not a body system, so it is not listed here.
 */
export const BODY_SYSTEMS = [
  { id: 'cardiovascular', label: 'Cardiovascular' },
  { id: 'musculoskeletal', label: 'Musculoskeletal' },
  { id: 'blood-biochemistry', label: 'Blood & Biochemistry' },
  { id: 'immune', label: 'Immune' },
  { id: 'vision', label: 'Vision (SANS)' },
  { id: 'sleep-cognition', label: 'Sleep & Cognition' },
  { id: 'behavioral-health', label: 'Behavioral Health' },
  { id: 'radiation', label: 'Radiation' },
  { id: 'nutrition', label: 'Nutrition' },
] as const;

export type BodySystemId = (typeof BODY_SYSTEMS)[number]['id'];

/** Left menu sections: the overview plus every body system. */
export type MenuSectionId = 'overview' | BodySystemId;

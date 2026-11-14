import type { SourceReference } from '@chief/shared';
import type { Medication } from '../src/db/types.js';

/**
 * Onboard formulary: the only medication CHIEF may suggest. Based on the ISS medical kit.
 *
 * No `dosage` is set on purpose: CHIEF must never give doses beyond the formulary, and we do not
 * invent them. Add a dosage only with a cited source (ISS medical kit checklist, flight surgeon).
 */
export interface FormularySeed extends Medication {
  source: SourceReference;
}

const ISS_KIT_SOURCE: SourceReference = {
  document:
    'NASA ISS Medical Kit Checklist; ISS medication list from NASA data released under FOIA (reproduced by WikEM)',
  url: 'https://www.nasa.gov/wp-content/uploads/2015/03/medical_kit_checklist_-_full_release.pdf',
};

export const FORMULARY: FormularySeed[] = [
  {
    id: 'acetaminophen-325',
    name: 'Acetaminophen 325 mg tablets',
    indication: 'Mild to moderate pain, headache and fever.',
    source: ISS_KIT_SOURCE,
  },
  {
    id: 'ibuprofen-400',
    name: 'Ibuprofen 400 mg tablets',
    indication: 'Mild to moderate pain, muscle and back pain, inflammation.',
    notes: 'Use with caution in crew members with asthma. Take with food.',
    source: ISS_KIT_SOURCE,
  },
  {
    id: 'aspirin',
    name: 'Aspirin',
    indication: 'Mild pain and fever.',
    source: ISS_KIT_SOURCE,
  },
  {
    id: 'melatonin',
    name: 'Melatonin',
    indication: 'Short-term sleep disturbance and circadian misalignment.',
    source: ISS_KIT_SOURCE,
  },
];

import type { Threshold } from '@chief/shared';

/**
 * Thresholds used by the rules engine. RULE: no threshold without a source, and no threshold
 * invented by us. The database rejects a row whose source has no document.
 *
 * Ranges are inclusive at `min` and exclusive at `max`. A value outside every range is critical, so
 * critical ranges are left out. Each entry's `verification` says how far its source was checked:
 *
 *   verified   the value was found in the cited document while preparing this file.
 *   to-verify  the value follows the cited public guideline from memory; check it against the
 *              document before the demo. `team-band` marks a caution band between the normal range
 *              and the critical limit that the team chose (the guideline has no such band).
 *
 * Metrics without a sourced threshold yet (they are measured and charted, but the rules engine
 * reports no status for them): heart-rate-variability, bone-mineral-density-change,
 * muscle-strength-change, reaction-time-mean, mood-score, stress-level, isolation-level,
 * radiation-dose-rate, calorie-intake, hydration, calcium-intake. Add them here with a source.
 */
export interface ThresholdSeed extends Threshold {
  verification: 'verified' | 'to-verify';
}

export const THRESHOLDS: ThresholdSeed[] = [
  {
    metricId: 'resting-heart-rate',
    ranges: [
      { status: 'nominal', range: { min: 60, max: 100 } },
      { status: 'caution', range: { min: 50, max: 60 } }, // team-band
      { status: 'caution', range: { min: 100, max: 120 } }, // team-band
    ],
    escalation: { caution: 'self-care', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Rest for 10 minutes, avoid caffeine and measure again. If it stays out of range or you feel unwell, contact the flight surgeon.',
    source: { document: 'American Heart Association: normal resting heart rate of 60 to 100 bpm' },
    verification: 'to-verify',
  },
  {
    metricId: 'blood-oxygen-saturation',
    ranges: [
      { status: 'nominal', range: { min: 95 } },
      { status: 'caution', range: { min: 90, max: 95 } },
    ],
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Check the sensor fit, breathe slowly and measure again. Check the cabin oxygen and CO2 levels and contact the flight surgeon if it stays low.',
    source: { document: 'WHO Pulse Oximetry Training Manual (2011): saturation below 90% is hypoxemia' },
    verification: 'to-verify',
  },
  {
    metricId: 'systolic-blood-pressure',
    ranges: [
      { status: 'nominal', range: { max: 120 } },
      { status: 'caution', range: { min: 120, max: 140 } },
    ],
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Rest seated for 5 minutes and measure again. Reduce salt and keep drinking fluids; report persistent high readings to the flight surgeon.',
    source: { document: 'ACC/AHA 2017 Guideline for High Blood Pressure in Adults' },
    verification: 'to-verify',
  },
  {
    metricId: 'diastolic-blood-pressure',
    ranges: [
      { status: 'nominal', range: { max: 80 } },
      { status: 'caution', range: { min: 80, max: 90 } },
    ],
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Rest seated for 5 minutes and measure again. Report persistent high readings to the flight surgeon.',
    source: { document: 'ACC/AHA 2017 Guideline for High Blood Pressure in Adults' },
    verification: 'to-verify',
  },
  {
    metricId: 'vitamin-d-25-oh',
    ranges: [
      { status: 'nominal', range: { min: 30 } },
      { status: 'caution', range: { min: 20, max: 30 } },
    ],
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Take the vitamin D supplement from the onboard kit as prescribed, keep calcium intake up and ask the flight surgeon whether the dose needs a review.',
    source: {
      document:
        'NASA JSC clinical decision flow: vitamin D deficiency is 25-OH D below 20 ng/mL, insufficiency 20 to 30 ng/mL',
      url: 'https://ntrs.nasa.gov/citations/20130013531',
    },
    verification: 'verified',
  },
  {
    metricId: 'urine-calcium',
    ranges: [
      { status: 'nominal', range: { max: 250 } },
      { status: 'caution', range: { min: 250, max: 300 } },
    ],
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Drink more fluids, review sodium intake and keep up resistive exercise. Report high urine calcium to the flight surgeon: it raises kidney-stone risk.',
    source: { document: 'Clinical definition of hypercalciuria: above 250 mg/day in women and 300 mg/day in men' },
    verification: 'to-verify',
  },
  {
    metricId: 'fasting-glucose',
    ranges: [
      { status: 'nominal', range: { min: 70, max: 100 } },
      { status: 'caution', range: { min: 100, max: 126 } },
      { status: 'caution', range: { min: 54, max: 70 } }, // ADA level 1 hypoglycemia
    ],
    escalation: { caution: 'self-care', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Review recent meals and sugar intake and repeat the fasting measurement. Report values that stay out of range to the flight surgeon.',
    source: { document: 'ADA Standards of Care in Diabetes: fasting glucose categories and hypoglycemia levels (<70, <54 mg/dL)' },
    verification: 'to-verify',
  },
  {
    metricId: 'white-blood-cell-count',
    ranges: [
      { status: 'nominal', range: { min: 4.5, max: 11 } },
      { status: 'caution', range: { min: 3.5, max: 4.5 } }, // team-band
      { status: 'caution', range: { min: 11, max: 15 } }, // team-band
    ],
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Check for signs of infection (fever, cough, wounds) and repeat the blood count. Contact the flight surgeon if the count stays out of range.',
    source: { document: 'Standard adult reference interval for white blood cell count (4.5 to 11.0 x10^3/uL)' },
    verification: 'to-verify',
  },
  {
    metricId: 'c-reactive-protein',
    ranges: [
      { status: 'nominal', range: { max: 3 } },
      { status: 'caution', range: { min: 3, max: 10 } },
    ],
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Look for a cause of inflammation (illness, injury, intense exercise) and repeat the test in a few days. Report values above 10 mg/L to the flight surgeon.',
    source: { document: 'CDC/AHA scientific statement on markers of inflammation (2003): C-reactive protein' },
    verification: 'to-verify',
  },
  {
    metricId: 'optic-disc-edema-grade',
    ranges: [
      { status: 'nominal', range: { max: 1 } },
      { status: 'caution', range: { min: 1, max: 3 } }, // team-band
    ],
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Report any blurred vision or headaches. Schedule a repeat eye exam and tell the flight surgeon: optic disc swelling is a sign of SANS.',
    source: { document: 'Frisén grading scale for papilledema (1982), used to grade optic disc edema' },
    verification: 'to-verify',
  },
  {
    metricId: 'intraocular-pressure',
    ranges: [
      { status: 'nominal', range: { min: 10, max: 22 } },
      { status: 'caution', range: { max: 10 } },
      { status: 'caution', range: { min: 22, max: 26 } }, // team-band
    ],
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Repeat the pressure measurement and report any eye pain or vision change to the flight surgeon.',
    source: { document: 'Standard ophthalmology reference: normal intraocular pressure is 10 to 21 mmHg' },
    verification: 'to-verify',
  },
  {
    metricId: 'sleep-duration',
    ranges: [
      { status: 'nominal', range: { min: 7 } },
      { status: 'caution', range: { min: 6, max: 7 } },
    ],
    escalation: { caution: 'self-care', critical: 'crew-medical-officer' },
    fallbackRecommendation:
      'Protect your sleep period: dim the lights an hour before bed, avoid screens and caffeine, and ask the flight surgeon about melatonin from the onboard kit.',
    source: { document: 'AASM and Sleep Research Society consensus statement (2015): adults need 7 or more hours of sleep' },
    verification: 'to-verify',
  },
  {
    metricId: 'sleep-efficiency',
    ranges: [
      { status: 'nominal', range: { min: 85 } },
      { status: 'caution', range: { min: 65, max: 85 } },
    ],
    escalation: { caution: 'self-care', critical: 'crew-medical-officer' },
    fallbackRecommendation:
      'Keep a regular sleep schedule, limit time awake in bed and check the noise and light in your sleep station.',
    source: { document: 'National Sleep Foundation sleep quality recommendations (Ohayon et al., 2017)' },
    verification: 'to-verify',
  },
  {
    metricId: 'cumulative-radiation-dose',
    ranges: [
      { status: 'nominal', range: { max: 300 } }, // team-band: half of the career limit
      { status: 'caution', range: { min: 300, max: 600 } },
    ],
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Limit time in high-dose areas, use the shielded shelter during solar particle events and tell the flight surgeon: the career limit is 600 mSv.',
    source: {
      document:
        'NASA-STD-3001 Vol. 1 Rev. C, requirement V1 4030: total career effective dose below 600 mSv',
      section: '4.8.2',
      url: 'https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf',
    },
    verification: 'verified',
  },
];

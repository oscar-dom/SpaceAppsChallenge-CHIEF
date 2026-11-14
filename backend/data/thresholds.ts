import type { Threshold } from '@chief/shared';

/**
 * Thresholds used by the rules engine. RULE: no threshold without a source, and no threshold
 * invented by us. The database rejects a row whose source has no document.
 *
 * Ranges are inclusive at `min` and exclusive at `max`. A value outside every range is critical, so
 * critical ranges are left out. Each entry's `verification` says how far its source was checked:
 *
 *   verified            the cut-offs were found in the cited document, or in several sources that
 *                       quote it, while preparing this file.
 *   partially-verified  the main cut-off was confirmed, but part of the entry (a second band, or the
 *                       revision of the document) was only found in a secondary source.
 *   to-verify           follows a well-known public reference that was not checked yet.
 *
 * `team-band` marks a caution band between the normal range and the critical limit that the team
 * chose because the source defines no such band. It is never used for the normal range itself.
 *
 * Metrics without a sourced threshold (measured and charted, but the rules engine reports no status):
 * heart-rate-variability (individual baseline), muscle-strength-change, reaction-time-mean, mood-score,
 * stress-level, isolation-level (no clinical cut-offs for these self-reports), radiation-dose-rate
 * (NASA limits are on accumulated dose, not on the rate) and calorie-intake (NASA sets it per person
 * with the DRI equations).
 */
export interface ThresholdSeed extends Threshold {
  verification: 'verified' | 'partially-verified' | 'to-verify';
}

export const THRESHOLDS: ThresholdSeed[] = [
  // --- cardiovascular ---------------------------------------------------------------------------
  {
    metricId: 'resting-heart-rate',
    ranges: [
      { status: 'nominal', range: { min: 60, max: 100 } },
      { status: 'caution', range: { min: 50, max: 60 } }, // team-band (fit adults often rest below 60)
      { status: 'caution', range: { min: 100, max: 120 } }, // team-band
    ],
    escalation: { caution: 'self-care', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Rest for 10 minutes, avoid caffeine and measure again. If it stays out of range or you feel unwell, contact the flight surgeon.',
    source: {
      document:
        'American Heart Association, quoted by Mayo Clinic: a normal resting heart rate for adults is 60 to 100 bpm',
      url: 'https://www.mayoclinic.org/healthy-lifestyle/fitness/expert-answers/heart-rate',
    },
    verification: 'verified',
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
    source: {
      document:
        'WHO Pulse Oximetry Training Manual (2011): saturation should be 95% or above; at 94% or below look for the cause; below 90% is a clinical emergency',
      url: 'https://www.phenxtoolkit.org/protocols/view/91102',
    },
    // Both cut-offs quoted verbatim from the manual by the PhenX protocol and in the WHO slide set.
    verification: 'verified',
  },
  {
    metricId: 'systolic-blood-pressure',
    ranges: [
      { status: 'nominal', range: { max: 120 } }, // normal
      { status: 'caution', range: { min: 120, max: 140 } }, // elevated and stage 1
    ], // >= 140: stage 2 hypertension
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Rest seated for 5 minutes and measure again. Reduce salt and keep drinking fluids; report persistent high readings to the flight surgeon.',
    source: {
      document:
        '2017 ACC/AHA Guideline for High Blood Pressure in Adults: normal < 120, elevated 120-129, stage 1 130-139, stage 2 >= 140 mmHg',
    },
    verification: 'verified',
  },
  {
    metricId: 'diastolic-blood-pressure',
    ranges: [
      { status: 'nominal', range: { max: 80 } }, // normal and elevated
      { status: 'caution', range: { min: 80, max: 90 } }, // stage 1
    ], // >= 90: stage 2 hypertension
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Rest seated for 5 minutes and measure again. Report persistent high readings to the flight surgeon.',
    source: {
      document:
        '2017 ACC/AHA Guideline for High Blood Pressure in Adults: stage 1 80-89, stage 2 >= 90 mmHg',
    },
    verification: 'verified',
  },

  // --- musculoskeletal --------------------------------------------------------------------------
  {
    metricId: 'bone-mineral-density-change',
    ranges: [
      { status: 'nominal', range: { min: -5 } }, // hip and spine at or above 95% of pre-mission
      { status: 'caution', range: { min: -10, max: -5 } }, // still above the 90% femoral neck target
    ],
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Keep up the resistive exercise sessions (ARED) and calcium and vitamin D intake, and tell the flight surgeon so the countermeasures can be reviewed.',
    source: {
      document:
        'NASA-STD-3001 Vol. 1 Rev. C, requirement V1 4027 (Pre-mission Bone Countermeasures): countermeasures shall maintain bone mineral density of the hip and spine at or above 95% of pre-mission values and at or above 90% for the femoral neck. Quoted in the NASA OCHMO Bone Loss technical brief OCHMO-MTB-013 Rev D',
      section: 'V1 4027',
      url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-030-bone-loss.pdf',
    },
    verification: 'verified',
  },

  // --- blood and biochemistry -------------------------------------------------------------------
  {
    metricId: 'vitamin-d-25-oh',
    ranges: [
      { status: 'nominal', range: { min: 30 } },
      { status: 'caution', range: { min: 20, max: 30 } }, // insufficiency
    ], // < 20: deficiency
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
      { status: 'caution', range: { min: 250, max: 300 } }, // above the women's cut-off, within the men's (275-300)
    ], // >= 300: above every traditional cut-off
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Drink more fluids, review sodium intake and keep up resistive exercise. Report high urine calcium to the flight surgeon: it raises kidney-stone risk.',
    source: {
      document:
        'Hypercalciuria review (PubMed 28846247): traditional cut-offs above 250 mg/day in women and 275-300 mg/day in men; StatPearls: normal 24-hour urine calcium below 250 mg',
      url: 'https://pubmed.ncbi.nlm.nih.gov/28846247/',
    },
    verification: 'verified',
  },
  {
    metricId: 'fasting-glucose',
    ranges: [
      { status: 'nominal', range: { min: 70, max: 100 } },
      { status: 'caution', range: { min: 100, max: 126 } }, // prediabetes range
      { status: 'caution', range: { min: 54, max: 70 } }, // level 1 hypoglycemia
    ], // >= 126: diabetes range; < 54: level 2 hypoglycemia
    escalation: { caution: 'self-care', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Review recent meals and sugar intake and repeat the fasting measurement. Report values that stay out of range to the flight surgeon.',
    source: {
      document:
        'ADA Standards of Care in Diabetes: fasting glucose 100-125 mg/dL prediabetes, >= 126 diabetes; classification of hypoglycemia: level 1 < 70 and >= 54 mg/dL, level 2 < 54 mg/dL',
      section: 'Diagnosis and Classification; Glycemic Goals and Hypoglycemia',
    },
    // Hypoglycemia levels confirmed in the Standards' classification table and ADA's own handouts.
    verification: 'verified',
  },

  // --- immune -----------------------------------------------------------------------------------
  {
    metricId: 'white-blood-cell-count',
    ranges: [
      { status: 'nominal', range: { min: 3.8, max: 10.8 } },
      { status: 'caution', range: { min: 3, max: 3.8 } }, // team-band
      { status: 'caution', range: { min: 10.8, max: 13 } }, // team-band
    ],
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Check for signs of infection (fever, cough, wounds) and repeat the blood count. Contact the flight surgeon if the count stays out of range.',
    source: {
      document:
        'Reference interval of the clinical laboratory that ran the Inspiration4 complete blood count (NASA OSDR OSD-569): 3.8 to 10.8 x10^3/uL',
      url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569',
    },
    verification: 'verified',
  },
  {
    metricId: 'c-reactive-protein',
    ranges: [
      { status: 'nominal', range: { max: 3 } }, // low and average risk
      { status: 'caution', range: { min: 3, max: 10 } }, // high risk
    ], // >= 10: look for an acute cause
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Look for a cause of inflammation (illness, injury, intense exercise) and repeat the test in a few days. Report values above 10 mg/L to the flight surgeon.',
    source: {
      document:
        'CDC/AHA scientific statement on markers of inflammation (Pearson et al., Circulation 2003;107:499-511): < 1 low, 1-3 average, > 3 mg/L high risk; a persistent, unexplained value > 10 mg/L should be evaluated for non-cardiovascular causes (infection, inflammation)',
    },
    // The > 10 mg/L recommendation is quoted by the CAP and LabCorp documents that cite the statement.
    verification: 'verified',
  },

  // --- vision (SANS) ----------------------------------------------------------------------------
  {
    metricId: 'optic-disc-edema-grade',
    ranges: [
      { status: 'nominal', range: { max: 1 } }, // grade 0: normal optic disc
      { status: 'caution', range: { min: 1, max: 3 } }, // team-band: grades 1-2 (very early, early)
    ], // >= 3: moderate, marked or severe edema
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Report any blurred vision or headaches. Schedule a repeat eye exam and tell the flight surgeon: optic disc swelling is a sign of SANS.',
    source: {
      document:
        'Frisén L. Swelling of the optic nerve head: a staging scheme. J Neurol Neurosurg Psychiatry 1982;45:13-18. Grades: 0 normal, 1 very early, 2 early, 3 moderate, 4 marked, 5 severe. Used to grade optic disc edema in the SANS case definition',
    },
    // The grades are verified; which grades count as caution or critical is a team choice.
    verification: 'verified',
  },
  {
    metricId: 'intraocular-pressure',
    ranges: [
      { status: 'nominal', range: { min: 10, max: 22 } }, // 10-21 mmHg
      { status: 'caution', range: { max: 10 } },
      { status: 'caution', range: { min: 22, max: 26 } }, // team-band: ocular hypertension starts above 21
    ],
    escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
    fallbackRecommendation:
      'Repeat the pressure measurement and report any eye pain or vision change to the flight surgeon.',
    source: {
      document:
        'Ophthalmology reference: normal intraocular pressure is 10 to 21 mmHg; ocular hypertension is a pressure above 21 mmHg without optic nerve damage',
    },
    verification: 'verified',
  },

  // --- sleep and cognition ----------------------------------------------------------------------
  {
    metricId: 'sleep-duration',
    ranges: [
      { status: 'nominal', range: { min: 7 } },
      { status: 'caution', range: { min: 6, max: 7 } }, // team-band
    ],
    escalation: { caution: 'self-care', critical: 'crew-medical-officer' },
    fallbackRecommendation:
      'Protect your sleep period: dim the lights an hour before bed, avoid screens and caffeine, and ask the flight surgeon about melatonin from the onboard kit.',
    source: {
      document:
        'AASM and Sleep Research Society consensus statement (2015): adults should sleep 7 or more hours per night on a regular basis',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4434546/',
    },
    verification: 'verified',
  },
  {
    metricId: 'sleep-efficiency',
    ranges: [
      { status: 'nominal', range: { min: 85 } },
      { status: 'caution', range: { min: 75, max: 85 } }, // NSF "uncertain" band for adults
    ], // < 75: does not indicate good sleep quality (adults 26-64, like the whole crew)
    escalation: { caution: 'self-care', critical: 'crew-medical-officer' },
    fallbackRecommendation:
      'Keep a regular sleep schedule, limit time awake in bed and check the noise and light in your sleep station.',
    source: {
      document:
        'National Sleep Foundation sleep quality recommendations (Ohayon et al., Sleep Health 2017;3(1):6-19): for adults aged 26-64, sleep efficiency of 85% or more indicates good sleep quality and 74% or less does not',
    },
    // Both cut-offs found in several sources quoting the paper (NSF release, DiMe core measures table).
    verification: 'verified',
  },

  // --- radiation --------------------------------------------------------------------------------
  {
    metricId: 'cumulative-radiation-dose',
    ranges: [
      { status: 'nominal', range: { max: 300 } }, // team-band: half of the career limit
      { status: 'caution', range: { min: 300, max: 600 } },
    ], // >= 600: career limit reached
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

  // --- nutrition --------------------------------------------------------------------------------
  {
    metricId: 'calcium-intake',
    ranges: [
      { status: 'nominal', range: { min: 1000, max: 2500 } }, // target 1000-1200, never above 2500
      { status: 'caution', range: { min: 600, max: 1000 } }, // team-band
    ], // >= 2500: above the upper limit
    escalation: { caution: 'self-care', critical: 'crew-medical-officer' },
    fallbackRecommendation:
      'Add calcium-rich items from the menu to reach 1000-1200 mg a day, without going above 2500 mg.',
    source: {
      document:
        'NASA JSC-67378 Rev. 1, Nutritional Requirements for Exploration Missions up to 365 days (2020): calcium 1000-1200 mg/day, not above 2500 mg/day',
      url: 'https://ntrs.nasa.gov/citations/20205008306',
    },
    verification: 'verified',
  },
  {
    metricId: 'hydration',
    ranges: [
      { status: 'nominal', range: { min: 2100 } },
      { status: 'caution', range: { min: 1500, max: 2100 } }, // team-band
    ],
    escalation: { caution: 'self-care', critical: 'crew-medical-officer' },
    fallbackRecommendation:
      'Drink more water through the day: enough fluid lowers kidney-stone risk and prevents dehydration.',
    source: {
      document:
        'NASA JSC-67378 Rev. 1 (2020): fluid 32 mL/kg/day, no less than 2100 mL/day for women and 2500 mL/day for men (the threshold uses the lower floor)',
      url: 'https://ntrs.nasa.gov/citations/20205008306',
    },
    verification: 'verified',
  },
];

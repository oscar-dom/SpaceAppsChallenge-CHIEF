'use strict';

/**
 * Generates simulated demo data (vitals, sleep, cognitive tests, wellbeing, exercise, nutrition,
 * cabin environment, ISS position, symptoms, health score, digital twin and today's tasks).
 *
 *  - Deterministic: same `seed` and same `now` => exactly the same data on every machine.
 *  - Relative to `now`: the data covers the last 14 days (vitals: 7) up to the reference instant.
 *  - Everything is marked `source = 'simulated'`. Real data (OSDR, PhysioNet) is imported separately
 *    and replaces this once it is ready.
 *
 * Run from reset.js after schema.sql and seed.sql.
 */

const { toDbDate } = require('./index.js');

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const STEP = 10 * MIN; // resolution of the continuous series
const HISTORY_DAYS = 14;
const VITAL_DAYS = 7;

/** Deterministic PRNG (mulberry32). */
function makeRandom(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const hourOfDay = (ms) => new Date(ms).getUTCHours() + new Date(ms).getUTCMinutes() / 60;

function levelFor(score) {
  if (score >= 80) return 'ok';
  if (score >= 65) return 'watch';
  if (score >= 50) return 'warning';
  return 'critical';
}

/**
 * @param {import('better-sqlite3').Database} db database already created with schema.sql and seed.sql
 * @param {{ now?: Date, seed?: number }} [options]
 */
function seedSimulated(db, { now = new Date(), seed = 42 } = {}) {
  const rand = makeRandom(seed);
  const uniform = (a, b) => a + (b - a) * rand();
  const gauss = (mean = 0, sd = 1) => {
    const u = 1 - rand();
    const v = rand();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const nowMs = Math.floor(now.getTime() / 1000) * 1000;
  const end = Math.floor(nowMs / STEP) * STEP; // last 10-minute step that is not in the future
  const start = end - HISTORY_DAYS * DAY;
  const vitalStart = end - VITAL_DAYS * DAY;
  const iso = (ms) => toDbDate(ms);

  const crew = db.prepare('SELECT id, weight_kg, mission_start FROM crew_members ORDER BY id').all();
  if (crew.length === 0) throw new Error('seed-simulated: crew_members is empty; load seed.sql first');
  const leoId = crew.find((c) => c.id === 'C002') ? 'C002' : crew[Math.min(1, crew.length - 1)].id;

  // --- Baseline physiology of each crew member (deterministic) -------------------------------------
  const profile = Object.fromEntries(
    crew.map((c, i) => [
      c.id,
      {
        hr: 60 + i * 2 + uniform(0, 3),
        hrv: 68 - i * 3 + uniform(-3, 3),
        spo2: 97.6 + uniform(-0.4, 0.4),
        rr: 14 + uniform(0, 1.5),
        skin: 33.6 + uniform(-0.3, 0.3),
        sys: 116 + i * 2,
        dia: 75 + i,
        sleepOffsetMin: uniform(-30, 30),
      },
    ])
  );

  // --- Cabin environment: CO2 with spikes (the demo correlates CO2 with C002's headaches) ----------
  // Four high-CO2 episodes spread over the last days (e.g. a saturated scrubber).
  const spikes = [11.6, 8.3, 5.4, 2.7].map((daysAgo) => ({
    start: end - daysAgo * DAY + uniform(-3, 3) * HOUR,
    dur: uniform(2.5, 3.5) * HOUR,
    peak: uniform(5.8, 7.0), // mmHg; a normal cabin is around 3
  }));
  const co2At = (t) => {
    let v = 3.0 + 0.25 * Math.sin(((hourOfDay(t) - 8) / 24) * 2 * Math.PI) + gauss(0, 0.08);
    for (const s of spikes) {
      if (t >= s.start && t <= s.start + s.dur) {
        v += (s.peak - 3.0) * Math.sin((Math.PI * (t - s.start)) / s.dur) ** 2;
      }
    }
    return v;
  };

  // --- ISS position (approximate circular orbit) and South Atlantic Anomaly -----------------------
  const PERIOD = 92.9 * MIN;
  const INC = (51.64 * Math.PI) / 180;
  const SIDEREAL_DAY = 86_164_100;
  const lon0 = uniform(-180, 180);
  const issAt = (t) => {
    const u = (2 * Math.PI * (t - start)) / PERIOD;
    const lat = (Math.asin(Math.sin(INC) * Math.sin(u)) * 180) / Math.PI;
    let lon = (Math.atan2(Math.cos(INC) * Math.sin(u), Math.cos(u)) * 180) / Math.PI + lon0 - (360 * (t - start)) / SIDEREAL_DAY;
    lon = ((((lon + 180) % 360) + 360) % 360) - 180;
    // SAA approximated as a rectangle (good enough for the demo).
    const inSaa = lat >= -50 && lat <= 0 && lon >= -90 && lon <= 40 ? 1 : 0;
    return { lat: round(lat, 3), lon: round(lon, 3), alt: round(408 + gauss(0, 2), 1), inSaa };
  };

  const stmt = {
    env: db.prepare('INSERT INTO env_readings (metric, value, unit, recorded_at, source) VALUES (?, ?, ?, ?, ?)'),
    iss: db.prepare('INSERT INTO iss_positions (recorded_at, lat, lon, alt_km, in_saa, source) VALUES (?, ?, ?, ?, ?, ?)'),
    vital: db.prepare(
      "INSERT INTO vital_samples (crew_id, metric, value, unit, recorded_at, source) VALUES (?, ?, ?, ?, ?, 'simulated')"
    ),
    sleep: db.prepare(
      'INSERT INTO sleep_sessions (crew_id, night_date, onset_at, wake_at, deep_min, rem_min, light_min, awake_min, efficiency_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    cog: db.prepare(
      'INSERT INTO cognitive_tests (crew_id, taken_at, reaction_ms_mean, lapses, score) VALUES (?, ?, ?, ?, ?)'
    ),
    well: db.prepare(
      'INSERT INTO wellbeing_entries (crew_id, logged_at, mood, isolation, crew_relations, stress) VALUES (?, ?, ?, ?, ?, ?)'
    ),
    ex: db.prepare(
      'INSERT INTO exercise_sessions (crew_id, started_at, type, duration_min, load_pct, avg_hr_bpm) VALUES (?, ?, ?, ?, ?, ?)'
    ),
    nut: db.prepare(
      'INSERT INTO nutrition_entries (crew_id, logged_at, meal, kcal, protein_g, water_ml, sodium_mg, calcium_mg, vitamin_d_iu) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    sym: db.prepare('INSERT INTO symptom_reports (crew_id, symptom, severity, recorded_at, note) VALUES (?, ?, ?, ?, ?)'),
    score: db.prepare(
      'INSERT INTO health_scores (crew_id, recorded_at, score, level, vitals, sleep, cognitive, nutrition, wellbeing, bone, radiation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    twin: db.prepare(
      'INSERT INTO twin_snapshots (crew_id, recorded_at, horizon_days, bone_density_loss_pct, muscle_mass_loss_pct, exercise_min_per_day, resistance_load_pct, model_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    task: db.prepare(
      'INSERT INTO tasks (crew_id, title, type, priority, origin, expects, due_at, status, result, created_at, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ),
  };

  // Accumulators to compute the health score from the same data that is inserted.
  const daily = {}; // crewId -> dayKey -> { hr: [], spo2: [], sleepEff, cog, wellbeing, kcal, loadPct }
  const slot = (crewId, key) => ((daily[crewId] ??= {})[key] ??= { hr: [], spo2: [] });
  const doseByDay = {};
  const exerciseStats = Object.fromEntries(crew.map((c) => [c.id, { min: 0, load: [], days: 0 }]));
  let counts = {};
  const bump = (k, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

  const run = db.transaction(() => {
    // ===== Environment and ISS (every 10 min, 14 days) =====
    for (let t = start; t <= end; t += STEP) {
      const at = iso(t);
      const pos = issAt(t);
      stmt.iss.run(at, pos.lat, pos.lon, pos.alt, pos.inSaa, 'simulated');
      const dose = (pos.inSaa ? 34 : 8) + gauss(0, 1.2);
      stmt.env.run('ppCO2', round(co2At(t), 2), 'mmHg', at, 'simulated');
      stmt.env.run('ppO2', round(160 + gauss(0, 0.8), 1), 'mmHg', at, 'simulated');
      stmt.env.run('cabinPressure', round(101.3 + gauss(0, 0.15), 2), 'kPa', at, 'simulated');
      stmt.env.run('cabinTemp', round(22.5 + gauss(0, 0.3), 1), 'degC', at, 'simulated');
      stmt.env.run('humidity', round(45 + gauss(0, 2), 1), '%', at, 'simulated');
      stmt.env.run('doseRate', round(Math.max(1, dose), 2), 'uSv/h', at, 'simulated');
      (doseByDay[dayKey(t)] ??= []).push(dose);
      bump('env_readings', 6);
      bump('iss_positions');
    }

    // ===== Vital signs (every 10 min, last 7 days) =====
    for (const c of crew) {
      const p = profile[c.id];
      for (let t = vitalStart; t <= end; t += STEP) {
        const at = iso(t);
        const h = hourOfDay(t);
        const asleep = (h >= 23 || h < 7) ? 1 : 0;
        const circ = Math.sin(((h - 9) / 24) * 2 * Math.PI);
        const hr = p.hr + 4 * circ - 7 * asleep + gauss(0, 2);
        const spo2 = clamp(p.spo2 - 0.5 * asleep + gauss(0, 0.3), 92, 100);
        stmt.vital.run(c.id, 'heartRate', round(hr, 1), 'bpm', at);
        stmt.vital.run(c.id, 'hrv', round(p.hrv + 6 * asleep + gauss(0, 4), 1), 'ms', at);
        stmt.vital.run(c.id, 'spo2', round(spo2, 1), '%', at);
        stmt.vital.run(c.id, 'respRate', round(p.rr - 1.5 * asleep + gauss(0, 0.5), 1), 'rpm', at);
        stmt.vital.run(c.id, 'skinTemp', round(p.skin - 0.4 * asleep + gauss(0, 0.1), 2), 'degC', at);
        bump('vital_samples', 5);
        const d = slot(c.id, dayKey(t));
        d.hr.push(hr);
        d.spo2.push(spo2);
      }
    }

    // ===== Daily routine (14 days): sleep, cognitive test, wellbeing, exercise, nutrition, blood pressure, weight =====
    for (const c of crew) {
      const p = profile[c.id];
      for (let d = HISTORY_DAYS; d >= 0; d--) {
        const dayStart = Math.floor(end / DAY) * DAY - d * DAY;
        const key = dayKey(dayStart);
        const rec = slot(c.id, key);

        // Sleep: the night that starts on day `key` at ~23:00 UTC and ends the next morning.
        const onset = dayStart + 23 * HOUR + p.sleepOffsetMin * MIN + gauss(0, 15) * MIN;
        const total = Math.round(clamp(gauss(450, 35), 330, 540));
        const wake = onset + total * MIN;
        if (wake <= nowMs) {
          const awake = Math.round(clamp(gauss(30, 10), 8, 70));
          const deep = Math.round(total * clamp(gauss(0.17, 0.02), 0.1, 0.25));
          const rem = Math.round(total * clamp(gauss(0.22, 0.02), 0.14, 0.3));
          const light = total - awake - deep - rem;
          const eff = round(((total - awake) / total) * 100, 1);
          stmt.sleep.run(c.id, key, iso(onset), iso(wake), deep, rem, light, awake, eff);
          rec.sleepEff = eff;
          bump('sleep_sessions');
        }

        // Cognitive test (PVT) ~10:00 UTC.
        const cogAt = dayStart + 10 * HOUR + Math.round(gauss(0, 10)) * MIN;
        if (cogAt <= nowMs) {
          const rt = clamp(gauss(262, 22), 210, 380);
          const lapses = Math.round(clamp(gauss(1.2, 1.1), 0, 6));
          const score = round(clamp(100 - (rt - 230) / 2.2 - lapses * 3, 0, 100), 1);
          stmt.cog.run(c.id, iso(cogAt), round(rt, 1), lapses, score);
          rec.cog = score;
          bump('cognitive_tests');
        }

        // Wellbeing ~21:00; isolation slowly rises.
        const wellAt = dayStart + 21 * HOUR;
        if (wellAt <= nowMs) {
          const drift = (HISTORY_DAYS - d) / HISTORY_DAYS;
          const mood = Math.round(clamp(gauss(4 - drift * 0.6, 0.7), 1, 5));
          const isolation = Math.round(clamp(gauss(2 + drift * 0.9, 0.6), 1, 5));
          const relations = Math.round(clamp(gauss(4.2, 0.6), 1, 5));
          const stress = Math.round(clamp(gauss(2.3 + drift * 0.4, 0.7), 1, 5));
          stmt.well.run(c.id, iso(wellAt), mood, isolation, relations, stress);
          rec.wellbeing = round((mood * 20 + (6 - stress) * 20 + (6 - isolation) * 20) / 3, 1);
          bump('wellbeing_entries');
        }

        // Exercise ~17:00, alternating cardio and resistance (ARED).
        const exAt = dayStart + 17 * HOUR + Math.round(gauss(0, 20)) * MIN;
        if (exAt <= nowMs) {
          const type = d % 2 === 0 ? 'resistance' : 'cardio';
          const minutes = Math.round(clamp(gauss(55, 8), 30, 90));
          const load = type === 'resistance' ? round(clamp(gauss(85, 10), 50, 120), 1) : null;
          stmt.ex.run(c.id, iso(exAt), type, minutes, load, round(p.hr + (type === 'cardio' ? 70 : 45) + gauss(0, 4), 1));
          const s = exerciseStats[c.id];
          s.min += minutes;
          s.days += 1;
          if (load !== null) s.load.push(load);
          bump('exercise_sessions');
        }

        // Nutrition: three meals and a snack.
        let kcalDay = 0;
        for (const [meal, hour, share] of [['breakfast', 7.5, 0.25], ['lunch', 12.5, 0.35], ['dinner', 19, 0.3], ['snack', 15.5, 0.1]]) {
          const at = dayStart + hour * HOUR;
          if (at > nowMs) continue;
          const kcal = Math.round(2600 * share * clamp(gauss(1, 0.1), 0.6, 1.3));
          kcalDay += kcal;
          stmt.nut.run(c.id, iso(at), meal, kcal, round(kcal * 0.045, 1), Math.round(kcal * 0.45), Math.round(kcal * 1.1), Math.round(kcal * 0.35), Math.round(kcal * 0.18));
          bump('nutrition_entries');
        }
        rec.kcal = kcalDay;

        // Blood pressure and weight in the morning (08:00).
        const bpAt = dayStart + 8 * HOUR;
        if (bpAt <= nowMs) {
          stmt.vital.run(c.id, 'systolicBp', Math.round(p.sys + gauss(0, 4)), 'mmHg', iso(bpAt));
          stmt.vital.run(c.id, 'diastolicBp', Math.round(p.dia + gauss(0, 3)), 'mmHg', iso(bpAt));
          const kg = c.weight_kg * (1 - 0.0008 * (HISTORY_DAYS - d)) + gauss(0, 0.15);
          stmt.vital.run(c.id, 'bodyMass', round(kg, 1), 'kg', iso(bpAt));
          bump('vital_samples', 3);
        }
      }
    }

    // ===== Symptoms: C002's headaches follow the CO2 spikes (1.5-2.5 h later) =====
    for (const s of spikes) {
      if (s.peak < 5.5) continue;
      const at = s.start + uniform(1.5, 2.5) * HOUR;
      if (at <= nowMs) {
        stmt.sym.run(leoId, 'headache', Math.round(uniform(3, 4.4)), iso(at), 'After a CO2 rise in the cabin');
        bump('symptom_reports');
      }
    }
    // Background noise: a few symptoms unrelated to CO2.
    for (let i = 0; i < 3; i++) {
      const who = crew[Math.floor(rand() * crew.length)].id;
      const at = start + uniform(0.1, 0.95) * (end - start);
      stmt.sym.run(who, rand() < 0.5 ? 'fatigue' : 'back_pain', Math.round(uniform(1, 2.4)), iso(at), null);
      bump('symptom_reports');
    }

    // ===== Daily health score (last 7 days) and digital twin =====
    for (const c of crew) {
      const stats = exerciseStats[c.id];
      const avgLoad = stats.load.length ? stats.load.reduce((a, b) => a + b, 0) / stats.load.length : 0;
      const exMinPerDay = stats.days ? stats.min / stats.days : 0;
      const effort = clamp(0.5 * (exMinPerDay / 60) + 0.5 * (avgLoad / 100), 0, 1);
      const missionDay = Math.max(0, Math.floor((end - Date.parse(c.mission_start)) / DAY));

      for (let d = VITAL_DAYS - 1; d >= 0; d--) {
        const dayStart = Math.floor(end / DAY) * DAY - d * DAY;
        const key = dayKey(dayStart);
        const at = Math.min(dayStart + 23 * HOUR + 50 * MIN, end);
        const rec = daily[c.id][key];
        const prev = daily[c.id][dayKey(dayStart - DAY)];
        const hrMean = rec.hr.reduce((a, b) => a + b, 0) / rec.hr.length;
        const spo2Mean = rec.spo2.reduce((a, b) => a + b, 0) / rec.spo2.length;
        const vitals = clamp(100 - Math.abs(hrMean - profile[c.id].hr) * 1.5 - Math.max(0, 97 - spo2Mean) * 8, 0, 100);
        const sleep = (prev?.sleepEff ?? rec.sleepEff) ?? null;
        const cognitive = rec.cog ?? prev?.cog ?? null;
        const nutrition = d === 0 ? clamp(((prev?.kcal ?? 2500) / 2600) * 100, 0, 100) : clamp((rec.kcal / 2600) * 100, 0, 100);
        const wellbeing = rec.wellbeing ?? prev?.wellbeing ?? null;
        const bone = clamp(100 - 0.15 * missionDay * (1 - 0.5 * effort), 0, 100);
        const doses = doseByDay[key] ?? [];
        const doseMean = doses.length ? doses.reduce((a, b) => a + b, 0) / doses.length : 12;
        const radiation = clamp(100 - Math.max(0, doseMean - 8) * 1.2, 0, 100);

        const parts = [vitals, sleep, cognitive, nutrition, wellbeing, bone, radiation];
        const present = parts.filter((x) => x !== null);
        const score = round(present.reduce((a, b) => a + b, 0) / present.length, 1);
        const r = (x) => (x === null ? null : round(x, 1));
        stmt.score.run(c.id, iso(at), score, levelFor(score), r(vitals), r(sleep), r(cognitive), r(nutrition), r(wellbeing), r(bone), r(radiation));
        bump('health_scores');
      }

      // Digital twin v1: bone loss ~1.2 %/month and muscle loss ~1.5 %/month without countermeasures; exercise reduces it.
      for (const horizon of [30, 90, 180]) {
        const months = (missionDay + horizon) / 30;
        const bone = round(1.2 * months * (1 - 0.55 * effort), 2);
        const muscle = round(1.5 * months * (1 - 0.6 * effort), 2);
        stmt.twin.run(c.id, iso(end), missionDay + horizon, bone, muscle, round(exMinPerDay, 1), round(avgLoad, 1), 'seed-v1');
        bump('twin_snapshots');
      }

      // ===== Today's tasks: the morning one is done, the rest are pending =====
      const todayStart = Math.floor(end / DAY) * DAY;
      const morning = todayStart + 8 * HOUR;
      const created = todayStart;
      const mDone = morning <= nowMs;
      stmt.task.run(
        c.id, 'Measure blood pressure', 'measurement', 'normal', 'routine', JSON.stringify({ metric: 'systolicBp' }),
        iso(morning), mDone ? 'done' : 'pending', mDone ? JSON.stringify({ systolicBp: Math.round(profile[c.id].sys), diastolicBp: Math.round(profile[c.id].dia) }) : null,
        iso(created), mDone ? iso(morning + 5 * MIN) : null
      );
      stmt.task.run(c.id, 'Exercise session', 'exercise', 'normal', 'routine', null, iso(todayStart + 17 * HOUR), todayStart + 17 * HOUR <= nowMs ? 'done' : 'pending', null, iso(created), todayStart + 17 * HOUR <= nowMs ? iso(todayStart + 18 * HOUR) : null);
      stmt.task.run(c.id, 'Wellbeing survey', 'survey', 'low', 'routine', null, iso(todayStart + 21 * HOUR), todayStart + 21 * HOUR <= nowMs ? 'done' : 'pending', null, iso(created), todayStart + 21 * HOUR <= nowMs ? iso(todayStart + 21 * HOUR + 3 * MIN) : null);
      bump('tasks', 3);
    }
  });

  run();
  counts = Object.fromEntries(Object.entries(counts).sort());
  return { seed, now: iso(nowMs), counts };
}

module.exports = { seedSimulated };

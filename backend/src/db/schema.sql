-- CHIEF: SQLite schema v3. 25 tables + 1 view.
--
-- Conventions
--   * Dates: TEXT 'YYYY-MM-DDTHH:mm:ssZ' (UTC, no milliseconds). Every date column has a GLOB CHECK
--     that rejects any other format (milliseconds, a space instead of 'T', ...).
--     From JS use toDbDate() (src/db/index.js); from SQL use strftime('%Y-%m-%dT%H:%M:%SZ', ...).
--   * Keys: INTEGER PRIMARY KEY AUTOINCREMENT (ids are never reused). Crew members: 'C001'..'C004'.
--   * Lists and objects: TEXT holding JSON, validated with CHECK (json_valid).
--   * Sync with ground: synced_at + sync_package_id. synced_at is set when the row is PACKAGED
--     (the moment the package leaves for the ground), not when it is delivered, so a second package
--     does not include the same rows again while the first is still in transit because of the delay.
--     sync_package_id points to the package (ops_messages.kind = 'telemetry_package'). If the ground
--     does not acknowledge it, the backend sets both columns back to NULL and the row is pending again.
--   * On every connection, enable: PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
--     (openDb() in src/db/index.js does it). The backend checks user_version at startup.
PRAGMA foreign_keys = ON;
PRAGMA user_version = 3;

-- 1. Crew and medical profile ----------------------------------------------------------------------
CREATE TABLE crew_members (
  id              TEXT PRIMARY KEY CHECK (id GLOB 'C[0-9][0-9][0-9]'),  -- 'C001'..'C004' (OSDR codes)
  name            TEXT NOT NULL,                   -- fictional
  role            TEXT NOT NULL,
  sex             TEXT CHECK (sex IN ('F','M')),
  birth_year      INTEGER,
  height_cm       REAL CHECK (height_cm > 0),
  weight_kg       REAL CHECK (weight_kg > 0),
  blood_type      TEXT,
  mission_start   TEXT NOT NULL CHECK (mission_start GLOB '????-??-??T??:??:??Z')  -- mission day 0
);

CREATE TABLE medical_profiles (
  crew_id         TEXT PRIMARY KEY REFERENCES crew_members(id) ON DELETE CASCADE,
  allergies       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allergies) AND json_type(allergies) = 'array'),   -- free text, for display
  conditions      TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(conditions) AND json_type(conditions) = 'array'), -- free text, for display
  -- Normalized codes ('asthma','penicillin','latex','migraine'...) matched against
  -- medications.avoid_with to warn about risks before a dose is given (v_medication_warnings).
  risk_tags       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(risk_tags) AND json_type(risk_tags) = 'array'),
  notes           TEXT
);

-- 2. Biometrics -------------------------------------------------------------------------------------
CREATE TABLE vital_samples (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  metric          TEXT NOT NULL CHECK (metric IN ('heartRate','hrv','spo2','respRate','skinTemp','systolicBp','diastolicBp','bodyMass')),
  value           REAL NOT NULL,
  unit            TEXT NOT NULL,                   -- bpm, ms, %, rpm, degC, mmHg, kg
  recorded_at     TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??Z'),
  source          TEXT NOT NULL CHECK (source IN ('physionet','simulated','manual')),
  level           TEXT NOT NULL DEFAULT 'ok' CHECK (level IN ('ok','watch','warning','critical','unknown')),
  client_id       TEXT UNIQUE,
  synced_at       TEXT CHECK (synced_at GLOB '????-??-??T??:??:??Z'),
  sync_package_id INTEGER REFERENCES ops_messages(id),
  -- One sample per crew member, metric and instant. It also works as the index for the charts.
  UNIQUE (crew_id, metric, recorded_at)
);

CREATE TABLE lab_results (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  panel           TEXT NOT NULL CHECK (panel IN ('cbc','cmp','cytokines')),  -- blood count, metabolic, cytokines
  analyte_code    TEXT NOT NULL,                   -- e.g. 'HGB', 'GLU', 'IL6'
  analyte_name    TEXT NOT NULL,
  value           REAL NOT NULL,
  unit            TEXT NOT NULL,
  ref_low         REAL,
  ref_high        REAL,
  phase           TEXT NOT NULL CHECK (phase IN ('preflight','inflight','postflight')),
  sampled_at      TEXT NOT NULL CHECK (sampled_at GLOB '????-??-??T??:??:??Z'),
  source          TEXT NOT NULL DEFAULT 'osdr' CHECK (source IN ('osdr','simulated'))
);
CREATE INDEX idx_labs_crew_panel ON lab_results (crew_id, panel, sampled_at);

CREATE TABLE sleep_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  night_date      TEXT NOT NULL CHECK (night_date GLOB '????-??-??'),  -- date (UTC) on which the night STARTS
  onset_at        TEXT NOT NULL CHECK (onset_at GLOB '????-??-??T??:??:??Z'),
  wake_at         TEXT NOT NULL CHECK (wake_at GLOB '????-??-??T??:??:??Z'),
  deep_min        INTEGER NOT NULL CHECK (deep_min >= 0),
  rem_min         INTEGER NOT NULL CHECK (rem_min >= 0),
  light_min       INTEGER NOT NULL CHECK (light_min >= 0),
  awake_min       INTEGER NOT NULL CHECK (awake_min >= 0),
  efficiency_pct  REAL NOT NULL CHECK (efficiency_pct BETWEEN 0 AND 100),
  client_id       TEXT UNIQUE,
  synced_at       TEXT CHECK (synced_at GLOB '????-??-??T??:??:??Z'),
  sync_package_id INTEGER REFERENCES ops_messages(id),
  CHECK (wake_at > onset_at),
  UNIQUE (crew_id, night_date)
);

CREATE TABLE cognitive_tests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  test_type       TEXT NOT NULL DEFAULT 'pvt',
  taken_at        TEXT NOT NULL CHECK (taken_at GLOB '????-??-??T??:??:??Z'),
  reaction_ms_mean REAL NOT NULL CHECK (reaction_ms_mean > 0),
  lapses          INTEGER NOT NULL CHECK (lapses >= 0),   -- reactions > 500 ms
  score           REAL NOT NULL CHECK (score BETWEEN 0 AND 100),
  client_id       TEXT UNIQUE,
  synced_at       TEXT CHECK (synced_at GLOB '????-??-??T??:??:??Z'),
  sync_package_id INTEGER REFERENCES ops_messages(id)
);
CREATE INDEX idx_cognitive_crew_time ON cognitive_tests (crew_id, taken_at);

CREATE TABLE nutrition_entries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  logged_at       TEXT NOT NULL CHECK (logged_at GLOB '????-??-??T??:??:??Z'),
  meal            TEXT CHECK (meal IN ('breakfast','lunch','dinner','snack')),
  kcal            REAL CHECK (kcal >= 0),
  protein_g       REAL CHECK (protein_g >= 0),
  water_ml        REAL CHECK (water_ml >= 0),
  sodium_mg       REAL CHECK (sodium_mg >= 0),
  calcium_mg      REAL CHECK (calcium_mg >= 0),
  vitamin_d_iu    REAL CHECK (vitamin_d_iu >= 0),
  client_id       TEXT UNIQUE,
  synced_at       TEXT CHECK (synced_at GLOB '????-??-??T??:??:??Z'),
  sync_package_id INTEGER REFERENCES ops_messages(id)
);
CREATE INDEX idx_nutrition_crew_time ON nutrition_entries (crew_id, logged_at);

CREATE TABLE wellbeing_entries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  logged_at       TEXT NOT NULL CHECK (logged_at GLOB '????-??-??T??:??:??Z'),
  mood            INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  isolation       INTEGER NOT NULL CHECK (isolation BETWEEN 1 AND 5),
  crew_relations  INTEGER NOT NULL CHECK (crew_relations BETWEEN 1 AND 5),
  stress          INTEGER CHECK (stress BETWEEN 1 AND 5),
  note            TEXT,                            -- sensitive: keep out of ground packages without consent
  client_id       TEXT UNIQUE,
  synced_at       TEXT CHECK (synced_at GLOB '????-??-??T??:??:??Z'),
  sync_package_id INTEGER REFERENCES ops_messages(id)
);
CREATE INDEX idx_wellbeing_crew_time ON wellbeing_entries (crew_id, logged_at);

CREATE TABLE symptom_reports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  symptom         TEXT NOT NULL CHECK (symptom IN ('headache','nausea','dizziness','fatigue','insomnia','congestion','back_pain','vision_change','other')),
  severity        INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  recorded_at     TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??Z'),
  note            TEXT,
  client_id       TEXT UNIQUE,
  synced_at       TEXT CHECK (synced_at GLOB '????-??-??T??:??:??Z'),
  sync_package_id INTEGER REFERENCES ops_messages(id)
);
CREATE INDEX idx_symptoms_crew_time ON symptom_reports (crew_id, recorded_at);

CREATE TABLE health_scores (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  recorded_at     TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??Z'),
  score           REAL NOT NULL CHECK (score BETWEEN 0 AND 100),
  level           TEXT NOT NULL CHECK (level IN ('ok','watch','warning','critical','unknown')),
  -- Components (0-100, NULL when there is no data); same names as healthScore.components in the API
  vitals          REAL CHECK (vitals BETWEEN 0 AND 100),
  sleep           REAL CHECK (sleep BETWEEN 0 AND 100),
  cognitive       REAL CHECK (cognitive BETWEEN 0 AND 100),
  nutrition       REAL CHECK (nutrition BETWEEN 0 AND 100),
  wellbeing       REAL CHECK (wellbeing BETWEEN 0 AND 100),
  bone            REAL CHECK (bone BETWEEN 0 AND 100),
  radiation       REAL CHECK (radiation BETWEEN 0 AND 100),
  synced_at       TEXT CHECK (synced_at GLOB '????-??-??T??:??:??Z'),   -- the summary is the cheapest thing to send to the ground
  sync_package_id INTEGER REFERENCES ops_messages(id)
);
CREATE INDEX idx_scores_crew_time ON health_scores (crew_id, recorded_at);

CREATE TABLE exercise_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  started_at      TEXT NOT NULL CHECK (started_at GLOB '????-??-??T??:??:??Z'),
  type            TEXT NOT NULL CHECK (type IN ('cardio','resistance')),
  duration_min    INTEGER NOT NULL CHECK (duration_min > 0),
  load_pct        REAL CHECK (load_pct >= 0),      -- % of body weight (ARED)
  avg_hr_bpm      REAL CHECK (avg_hr_bpm > 0),
  client_id       TEXT UNIQUE,
  synced_at       TEXT CHECK (synced_at GLOB '????-??-??T??:??:??Z'),
  sync_package_id INTEGER REFERENCES ops_messages(id)
);
CREATE INDEX idx_exercise_crew_time ON exercise_sessions (crew_id, started_at);

-- 3. AI, alerts and actions --------------------------------------------------------------------------
CREATE TABLE twin_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  recorded_at     TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??Z'),   -- when it was computed
  horizon_days    INTEGER NOT NULL CHECK (horizon_days > 0),                         -- projected mission day
  bone_density_loss_pct REAL NOT NULL,
  muscle_mass_loss_pct  REAL NOT NULL,
  exercise_min_per_day  REAL,
  resistance_load_pct   REAL,
  model_version   TEXT NOT NULL DEFAULT 'v1'
);
CREATE INDEX idx_twin_crew_time ON twin_snapshots (crew_id, recorded_at);

CREATE TABLE anomalies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  -- SET NULL: if old readings are pruned or aggregated, the anomaly is kept without its sample.
  sample_id       INTEGER REFERENCES vital_samples(id) ON DELETE SET NULL,
  metric          TEXT NOT NULL,
  value           REAL NOT NULL,
  z_score         REAL,
  level           TEXT NOT NULL CHECK (level IN ('watch','warning','critical')),
  detected_at     TEXT NOT NULL CHECK (detected_at GLOB '????-??-??T??:??:??Z'),
  synced_at       TEXT CHECK (synced_at GLOB '????-??-??T??:??:??Z'),
  sync_package_id INTEGER REFERENCES ops_messages(id)
);
CREATE INDEX idx_anomalies_crew_time ON anomalies (crew_id, detected_at);

CREATE TABLE alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT REFERENCES crew_members(id),   -- NULL = affects the spacecraft
  category        TEXT NOT NULL CHECK (category IN ('vitals','sleep','cognitive','nutrition','wellbeing','radiation','cabin','spaceWeather','ops')),
  level           TEXT NOT NULL CHECK (level IN ('watch','warning','critical')),
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  source          TEXT NOT NULL,                   -- 'NOAA SWPC', 'anomaly-detector', ...
  -- Alert lifecycle (what the crew member does)...
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ack','resolved')),
  -- ...and the state of the decision with the ground (time-delay triage), independent of the above:
  --   none            no ground decision needed
  --   pending_ground  waiting for the ground's reply (there is a message in ops_messages)
  --   ground_replied  the ground replied and its decision was applied
  --   autonomous      the deadline passed and the autonomous protocol was applied
  decision        TEXT NOT NULL DEFAULT 'none' CHECK (decision IN ('none','pending_ground','ground_replied','autonomous')),
  decision_at     TEXT CHECK (decision_at GLOB '????-??-??T??:??:??Z'),
  created_at      TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??Z'),
  ack_at          TEXT CHECK (ack_at GLOB '????-??-??T??:??:??Z'),
  resolved_at     TEXT CHECK (resolved_at GLOB '????-??-??T??:??:??Z'),
  synced_at       TEXT CHECK (synced_at GLOB '????-??-??T??:??:??Z'),
  sync_package_id INTEGER REFERENCES ops_messages(id),
  scenario_run_id INTEGER REFERENCES scenario_runs(id)
);
CREATE INDEX idx_alerts_status ON alerts (status, created_at DESC);
CREATE INDEX idx_alerts_decision ON alerts (decision) WHERE decision = 'pending_ground';

CREATE TABLE tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  title           TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('measurement','exercise','medication','checkup','countermeasure','survey')),
  priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  origin          TEXT NOT NULL CHECK (origin IN ('routine','alert','ground','copilot')),
  alert_id        INTEGER REFERENCES alerts(id),
  expects         TEXT CHECK (expects IS NULL OR json_valid(expects)),   -- JSON, e.g. {"metric":"systolicBp"}
  due_at          TEXT CHECK (due_at GLOB '????-??-??T??:??:??Z'),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','skipped')),
  result          TEXT CHECK (result IS NULL OR json_valid(result)),     -- JSON
  created_at      TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??Z'),
  done_at         TEXT CHECK (done_at GLOB '????-??-??T??:??:??Z'),
  client_id       TEXT UNIQUE
);
CREATE INDEX idx_tasks_crew_status ON tasks (crew_id, status, due_at);

CREATE TABLE countermeasures (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  rule_code       TEXT NOT NULL,                   -- e.g. 'SAA_PROTONS_SHELTER'
  action          TEXT NOT NULL,
  alert_id        INTEGER REFERENCES alerts(id),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','dismissed')),
  created_at      TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??Z')
);
CREATE INDEX idx_countermeasures_crew ON countermeasures (crew_id, status);

CREATE TABLE copilot_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,                   -- sensitive (medical conversation)
  triage_level    TEXT,
  created_at      TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??Z')
);
CREATE INDEX idx_copilot_crew_time ON copilot_messages (crew_id, created_at);

-- 4. Inventory, dosing schedules and emergencies -------------------------------------------------------
CREATE TABLE medications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,            -- UNIQUE: the seed cannot duplicate the inventory
  form            TEXT,                            -- tablet, injection, ...
  unit            TEXT NOT NULL,
  stock           REAL NOT NULL CHECK (stock >= 0),
  min_stock       REAL NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  -- Risk codes ('asthma','penicillin'...) for which the drug is not recommended.
  avoid_with      TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(avoid_with) AND json_type(avoid_with) = 'array'),
  expires_at      TEXT CHECK (expires_at GLOB '????-??-??T??:??:??Z')
);

-- Prescription (dosing schedule): what to take, how much, every how many hours and until when.
-- Each real intake is stored in medication_doses; upcoming intakes are generated by the backend as tasks.
CREATE TABLE prescriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  medication_id   INTEGER NOT NULL REFERENCES medications(id),
  dose            REAL NOT NULL CHECK (dose > 0),
  every_h         INTEGER NOT NULL CHECK (every_h > 0),
  start_at        TEXT NOT NULL CHECK (start_at GLOB '????-??-??T??:??:??Z'),
  end_at          TEXT CHECK (end_at GLOB '????-??-??T??:??:??Z'),
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  reason          TEXT,
  prescribed_by   TEXT NOT NULL DEFAULT 'copilot' CHECK (prescribed_by IN ('copilot','ground','crew')),
  CHECK (end_at IS NULL OR end_at > start_at)
);
CREATE INDEX idx_prescriptions_crew ON prescriptions (crew_id, active);

CREATE TABLE medication_doses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id         TEXT NOT NULL REFERENCES crew_members(id),
  medication_id   INTEGER NOT NULL REFERENCES medications(id),
  prescription_id INTEGER REFERENCES prescriptions(id),   -- NULL = one-off dose outside any prescription
  dose            REAL NOT NULL CHECK (dose > 0),
  given_at        TEXT NOT NULL CHECK (given_at GLOB '????-??-??T??:??:??Z'),
  reason          TEXT,
  client_id       TEXT UNIQUE,
  synced_at       TEXT CHECK (synced_at GLOB '????-??-??T??:??:??Z'),
  sync_package_id INTEGER REFERENCES ops_messages(id)
);
CREATE INDEX idx_doses_crew_time ON medication_doses (crew_id, given_at);

-- Triage guides. steps = JSON array of nodes, of three types:
--   {"id":1,"type":"question","text":"...","yes":2,"no":7}   question: jumps to 'yes' or 'no'
--   {"id":2,"type":"action","text":"...","next":3}            action to perform: continues at 'next'
--   {"id":7,"type":"end","text":"..."}                        end of the protocol, with the final instruction
-- The first node of the array is the start.
CREATE TABLE emergency_protocols (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,            -- 'chest-pain', 'radiation-shelter'
  title           TEXT NOT NULL,
  category        TEXT NOT NULL,
  disclaimer      TEXT NOT NULL DEFAULT 'Fictional demo content; it does not replace medical judgement.',
  steps           TEXT NOT NULL CHECK (json_valid(steps) AND json_type(steps) = 'array')
);

-- 5. Environment, operations and scenarios -----------------------------------------------------------
CREATE TABLE env_readings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  metric          TEXT NOT NULL CHECK (metric IN ('ppCO2','ppO2','cabinPressure','cabinTemp','humidity','doseRate')),
  value           REAL NOT NULL,
  unit            TEXT NOT NULL,
  recorded_at     TEXT NOT NULL CHECK (recorded_at GLOB '????-??-??T??:??:??Z'),
  source          TEXT NOT NULL,                   -- 'isslive', 'eda-csv', 'radlab', 'simulated'
  UNIQUE (metric, recorded_at, source)
);

-- ISS position, to correlate radiation with the South Atlantic Anomaly (SAA).
-- Its own table (one row = one position) instead of three loose metrics in env_readings.
CREATE TABLE iss_positions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_at     TEXT NOT NULL UNIQUE CHECK (recorded_at GLOB '????-??-??T??:??:??Z'),
  lat             REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon             REAL NOT NULL CHECK (lon BETWEEN -180 AND 180),
  alt_km          REAL,
  in_saa          INTEGER NOT NULL CHECK (in_saa IN (0,1)),
  source          TEXT NOT NULL                    -- 'wheretheiss', 'opennotify', 'simulated'
);

CREATE TABLE ops_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  direction       TEXT NOT NULL CHECK (direction IN ('to_ground','to_crew')),
  kind            TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('message','telemetry_package','decision')),
  crew_id         TEXT REFERENCES crew_members(id),
  alert_id        INTEGER REFERENCES alerts(id),
  body            TEXT NOT NULL,                   -- human-readable text
  payload         TEXT CHECK (payload IS NULL OR json_valid(payload)),   -- JSON (package or decision)
  size_bytes      INTEGER CHECK (size_bytes >= 0),
  priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  sent_at         TEXT NOT NULL CHECK (sent_at GLOB '????-??-??T??:??:??Z'),
  deliver_at      TEXT NOT NULL CHECK (deliver_at GLOB '????-??-??T??:??:??Z'),   -- sent_at + delay
  delivered       INTEGER NOT NULL DEFAULT 0 CHECK (delivered IN (0,1)),
  client_id       TEXT UNIQUE,
  CHECK (deliver_at >= sent_at)
);
CREATE INDEX idx_ops_delivery ON ops_messages (delivered, deliver_at);

CREATE TABLE scenario_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL CHECK (code IN ('solar_storm','eclss_failure','mars_delay')),
  started_at      TEXT NOT NULL CHECK (started_at GLOB '????-??-??T??:??:??Z'),
  ended_at        TEXT CHECK (ended_at GLOB '????-??-??T??:??:??Z'),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
-- At most one active scenario (ended_at NULL) at a time.
CREATE UNIQUE INDEX one_active_scenario ON scenario_runs ((1)) WHERE ended_at IS NULL;

-- Environment time-series index (the UNIQUE on vital_samples already covers the vitals) -----------------
CREATE INDEX idx_env_metric_time ON env_readings (metric, recorded_at DESC);

-- Pending sync with the ground (partial indexes) ---------------------------------------------------------
CREATE INDEX idx_vitals_unsynced     ON vital_samples (recorded_at)    WHERE synced_at IS NULL;
CREATE INDEX idx_symptoms_unsynced   ON symptom_reports (recorded_at)  WHERE synced_at IS NULL;
CREATE INDEX idx_alerts_unsynced     ON alerts (created_at)            WHERE synced_at IS NULL;
CREATE INDEX idx_anomalies_unsynced  ON anomalies (detected_at)        WHERE synced_at IS NULL;
CREATE INDEX idx_scores_unsynced     ON health_scores (recorded_at)    WHERE synced_at IS NULL;
CREATE INDEX idx_doses_unsynced      ON medication_doses (given_at)    WHERE synced_at IS NULL;

-- Drug-safety view: matches each crew member's risks with the drugs that are not recommended for them.
-- Before recording a dose: SELECT * FROM v_medication_warnings WHERE crew_id = ? AND medication_id = ?;
CREATE VIEW v_medication_warnings AS
SELECT c.id        AS crew_id,
       m.id        AS medication_id,
       m.name      AS medication_name,
       w.value     AS risk_tag
FROM crew_members c
JOIN medical_profiles p ON p.crew_id = c.id
JOIN json_each(p.risk_tags) AS r
JOIN medications m
JOIN json_each(m.avoid_with) AS w ON w.value = r.value;

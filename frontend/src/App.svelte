<script>
  import { onMount } from 'svelte';
  import { api, withClientMeta, connectStream, streamCopilot, flushOfflineQueue } from './lib/api.js';

  const LV = {
    ok: ['Normal', '#6bd18a'],
    watch: ['Vigilar', '#f0d84a'],
    warning: ['Aviso', '#f59e42'],
    critical: ['Crítico', '#ff5a4e'],
    unknown: ['Sin datos', '#8b949e']
  };

  const L = (l) => (LV[l] ? LV[l][0] : LV.unknown[0]);
  const K = (l) => (LV[l] ? LV[l][1] : LV.unknown[1]);

  const ZONE_META = {
    head: { label: 'Cabeza', x: 60, y: 32, r: 6 },
    eyes: { label: 'Ojos', x: 60, y: 19, r: 4 },
    chest: { label: 'Tórax', x: 60, y: 56, r: 7 },
    heart: { label: 'Corazón', x: 68, y: 78, r: 6 },
    lungs: { label: 'Pulmones', x: 49, y: 66, r: 7 },
    abdomen: { label: 'Abdomen', x: 60, y: 106, r: 7 },
    muscles: { label: 'Músculos', x: 46, y: 190, r: 7 },
    bones: { label: 'Huesos', x: 60, y: 150, r: 6 },
    skin: { label: 'Piel', x: 22, y: 90, r: 5 }
  };

  const MODULE_LABELS = {
    vitals: 'Constantes',
    sleep: 'Sueño',
    cognitive: 'Cognitivo',
    nutrition: 'Nutrición',
    wellbeing: 'Bienestar',
    bone: 'Hueso',
    radiation: 'Radiación'
  };

  const METRIC_LABELS = {
    heartRate: 'Frec. cardiaca',
    spo2: 'SpO2',
    systolicBp: 'Tensión sistólica',
    diastolicBp: 'Tensión diastólica',
    respRate: 'Frec. respiratoria',
    bodyTemp: 'Temperatura',
    hrv: 'VFC (HRV)'
  };

  const SYMPTOM_LABELS = {
    headache: 'Cefalea',
    nausea: 'Náuseas',
    dizziness: 'Mareo',
    fatigue: 'Fatiga',
    insomnia: 'Insomnio',
    congestion: 'Congestión',
    back_pain: 'Dolor lumbar',
    vision_change: 'Cambio visual',
    other: 'Otro'
  };

  // Resumen (overview) ya no está en el menú lateral: se abre desde las pestañas superiores de tripulantes
  const TABS = [
    ['home', 'Inicio', '/crew'],
    ['vit', 'Constantes', '/crew/:id/vitals'],
    ['sleep', 'Sueño', '/crew/:id/sleep'],
    ['cog', 'Fatiga', '/crew/:id/cognitive'],
    ['well', 'Bienestar', '/crew/:id/wellbeing'],
    ['med', 'Ficha médica', '/crew/:id/medical y /labs'],
    ['twin', 'Gemelo digital', '/crew/:id/twin'],
    ['env', 'Entorno', '/environment/*'],
    ['ops', 'Control de Tierra', '/ops/messages']
  ];

  let mission = {
    missionDay: 42,
    missionTime: '2026-11-14T10:32:00Z',
    timeScale: 1,
    commDelaySec: 0,
    scenario: null,
    iss: { lat: -28.4, lon: -41.7, altKm: 418, inSAA: true },
    spaceWeather: { kp: 5.3, protonFluxPfu: 120, level: 'critical' },
    dataMode: 'live'
  };

  let crew = [];
  let selectedId = 'C002';
  let tab = 'ov';
  let rt = 'a';
  let open = true;
  let scOpen = false;
  let scenarios = [];
  let chat = false;
  let selectedZone = 'heart';
  let staleNote = '';

  // Datos del tripulante y pestañas
  let overview = null;
  let countermeasures = [];
  let healthHistory = [];
  let alerts = [];
  let tasks = [];

  // Constantes
  let selectedMetric = 'heartRate';
  let vitalSeries = null;
  let newVitalMetric = 'systolicBp';
  let newVitalValue = '';

  // Sueño y Fatiga (PVT)
  let sleepList = [];
  let cognitiveList = [];
  let pvtState = 'idle'; // idle | waiting | ready | result
  let pvtStart = 0;
  let pvtLastMs = null;
  let pvtTimer = null;

  // Bienestar, Síntomas y Nutrición
  let wellbeingList = [];
  let symptomsList = [];
  let nutritionList = [];
  let wbMood = 4;
  let wbIsolation = 4;
  let wbCohab = 5;
  let wbNote = '';
  let symType = 'headache';
  let symSeverity = 2;
  let symNote = '';

  // Ficha médica y Analíticas
  let medical = null;
  let labs = [];
  let labPhase = 'all';

  // Gemelo digital
  let twin = null;
  let simExercise = 90;
  let simLoad = 60;

  // Entorno y Control de Tierra
  let spaceWeather = null;
  let issPos = null;
  let cabin = null;
  let correlations = [];
  let opsMessages = [];
  let newOpsBody = '';

  // Copiloto IA
  let chatInput = '';
  let chatMessages = [
    { role: 'user', content: 'Tengo dolor de cabeza' },
    {
      role: 'assistant',
      context: 'FC 104 bpm, CO₂ de cabina 4,1 mmHg, alerta de radiación activa.',
      content: 'Con tu CO₂ de cabina elevado (4,1 mmHg) y la alerta de protones activa, revisa la ventilación del módulo, hidrátate y mide tu tensión arterial.'
    }
  ];
  let streamingChat = false;
  let chatAbort = null;

  $: c = crew.find((m) => m.id === selectedId) || {
    id: selectedId,
    name: 'Tripulante',
    role: '',
    healthScore: { score: null, level: 'unknown', components: [] }
  };
  $: tb = TABS.find((x) => x[0] === tab);
  $: openAlertsCount = alerts.filter((a) => a.status === 'active' || a.status === 'pending_ground').length;

  $: zones = Object.entries(ZONE_META).map(([key, meta]) => {
    const found = overview?.bodyZones?.find((z) => z.zone === key) || {
      zone: key,
      level: 'unknown',
      reason: 'Sin datos'
    };
    const on = key === selectedZone;
    return {
      key,
      name: meta.label,
      lvl: L(found.level),
      col: K(found.level),
      reason: found.reason || 'Sin hallazgos',
      x: meta.x,
      y: meta.y,
      r: found.level === 'ok' ? meta.r : meta.r + 2,
      stroke: on ? '#fff' : '#12151a',
      sw: on ? 3 : 1.5
    };
  });

  $: zsel = zones.find((z) => z.key === selectedZone) || zones[0];

  function selectCrewOverview(id) {
    selectedId = id;
    tab = 'ov';
  }

  function formatUtc(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(11, 19);
  }

  function formatDelay(sec) {
    if (!sec) return '0 s';
    return sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec} s`;
  }

  function trackMeta(res) {
    if (res?.fromCache) {
      staleNote = 'Sin conexión: mostrando datos en caché local';
    } else if (res?.meta?.stale) {
      staleNote = 'Datos de fuente externa en caché (stale)';
    } else {
      staleNote = '';
    }
  }

  async function loadCore() {
    const [misRes, crewRes, scRes] = await Promise.all([
      api('/mission/status'),
      api('/crew'),
      api('/scenarios')
    ]);
    mission = misRes.data;
    crew = crewRes.data;
    scenarios = scRes.data;
    trackMeta(misRes);
  }

  async function loadCrewBase(id) {
    const [ovRes, alRes, tkRes, cmRes] = await Promise.all([
      api(`/crew/${id}/overview`),
      api(`/alerts?crewId=${id}&status=open`),
      api(`/crew/${id}/tasks?status=pending`),
      api(`/crew/${id}/countermeasures`)
    ]);
    overview = ovRes.data;
    alerts = alRes.data;
    tasks = tkRes.data;
    countermeasures = cmRes.data;
    trackMeta(ovRes);
  }

  async function loadActiveTab(id, currentTab) {
    if (currentTab === 'home') {
      const hsRes = await api(`/crew/${id}/health-scores`);
      healthHistory = hsRes.data;
    } else if (currentTab === 'vit') {
      const vRes = await api(`/crew/${id}/vitals?metric=${selectedMetric}&bucket=5m`);
      vitalSeries = vRes.data;
    } else if (currentTab === 'sleep') {
      const sRes = await api(`/crew/${id}/sleep?days=7`);
      sleepList = sRes.data;
    } else if (currentTab === 'cog') {
      const cRes = await api(`/crew/${id}/cognitive`);
      cognitiveList = cRes.data;
    } else if (currentTab === 'well') {
      const [wRes, symRes, nRes] = await Promise.all([
        api(`/crew/${id}/wellbeing`),
        api(`/crew/${id}/symptoms`),
        api(`/crew/${id}/nutrition?days=7`)
      ]);
      wellbeingList = wRes.data;
      symptomsList = symRes.data;
      nutritionList = nRes.data;
    } else if (currentTab === 'med') {
      const q = labPhase === 'all' ? '' : `?phase=${labPhase}`;
      const [mRes, lRes] = await Promise.all([
        api(`/crew/${id}/medical`),
        api(`/crew/${id}/labs${q}`)
      ]);
      medical = mRes.data;
      labs = lRes.data;
    } else if (currentTab === 'twin') {
      const tRes = await api(`/crew/${id}/twin?horizonDays=180`);
      twin = tRes.data;
      if (twin?.assumptions) {
        simExercise = twin.assumptions.exerciseMinPerDay;
        simLoad = twin.assumptions.resistanceLoadPct;
      }
    } else if (currentTab === 'env') {
      const [swRes, issRes, cabRes, corRes] = await Promise.all([
        api('/environment/space-weather'),
        api('/environment/iss-position'),
        api('/environment/cabin'),
        api(`/crew/${id}/correlations`)
      ]);
      spaceWeather = swRes.data;
      issPos = issRes.data;
      cabin = cabRes.data;
      correlations = corRes.data;
    } else if (currentTab === 'ops') {
      const opRes = await api('/ops/messages');
      opsMessages = opRes.data;
    }
  }

  $: if (selectedId) {
    loadCrewBase(selectedId);
  }

  $: if (selectedId && tab) {
    loadActiveTab(selectedId, tab);
  }

  async function toggleScenario(code) {
    scOpen = false;
    if (!code) {
      await api('/scenarios/stop', { method: 'POST' });
    } else {
      await api(`/scenarios/${code}/start`, { method: 'POST' });
    }
    const misRes = await api('/mission/status');
    mission = misRes.data;
    await loadCrewBase(selectedId);
  }

  async function updateAlertStatus(alertId, status) {
    const res = await api(`/alerts/${alertId}`, {
      method: 'PATCH',
      body: JSON.stringify(withClientMeta({ status }, true))
    });
    alerts = alerts
      .map((a) => (a.id === alertId ? res.data : a))
      .filter((a) => a.status !== 'resolved');
  }

  async function completeTask(task) {
    const result =
      task.type === 'measurement'
        ? { value: 124, unit: task.expects?.unit || 'mmHg' }
        : { note: 'Completado desde panel de tripulación' };
    await api(`/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify(withClientMeta({ status: 'done', result }, true))
    });
    tasks = tasks.filter((t) => t.id !== task.id);
    if (task.type === 'measurement') {
      await loadCrewBase(selectedId);
    }
  }

  async function submitManualVital() {
    const val = Number(newVitalValue);
    if (!Number.isFinite(val) || newVitalValue === '') return;
    const unitMap = {
      heartRate: 'bpm',
      spo2: '%',
      systolicBp: 'mmHg',
      diastolicBp: 'mmHg',
      respRate: 'rpm',
      bodyTemp: 'C',
      hrv: 'ms'
    };
    await api(`/crew/${selectedId}/vitals`, {
      method: 'POST',
      body: JSON.stringify(
        withClientMeta({
          metric: newVitalMetric,
          value: val,
          unit: unitMap[newVitalMetric] || ''
        })
      )
    });
    newVitalValue = '';
    await loadCrewBase(selectedId);
    if (tab === 'vit') await loadActiveTab(selectedId, 'vit');
  }

  function startPvtTest() {
    clearTimeout(pvtTimer);
    pvtLastMs = null;
    pvtState = 'waiting';
    const delay = 1400 + Math.random() * 2200;
    pvtTimer = setTimeout(() => {
      pvtState = 'ready';
      pvtStart = performance.now();
    }, delay);
  }

  async function hitPvtTarget() {
    if (pvtState !== 'ready') return;
    const ms = Math.round(performance.now() - pvtStart);
    pvtLastMs = ms;
    pvtState = 'result';
    await api(`/crew/${selectedId}/cognitive`, {
      method: 'POST',
      body: JSON.stringify(
        withClientMeta({
          meanReactionMs: ms,
          lapses: ms > 350 ? 1 : 0
        })
      )
    });
    await loadActiveTab(selectedId, 'cog');
  }

  async function submitWellbeing() {
    await api(`/crew/${selectedId}/wellbeing`, {
      method: 'POST',
      body: JSON.stringify(
        withClientMeta({
          mood: Number(wbMood),
          isolation: Number(wbIsolation),
          cohabitation: Number(wbCohab),
          note: wbNote
        })
      )
    });
    wbNote = '';
    await loadActiveTab(selectedId, 'well');
  }

  async function submitSymptom() {
    await api(`/crew/${selectedId}/symptoms`, {
      method: 'POST',
      body: JSON.stringify(
        withClientMeta({
          symptom: symType,
          severity: Number(symSeverity),
          note: symNote
        })
      )
    });
    symNote = '';
    await loadActiveTab(selectedId, 'well');
  }

  async function simulateTwin() {
    const res = await api(`/crew/${selectedId}/twin/simulate`, {
      method: 'POST',
      body: JSON.stringify({
        exerciseMinPerDay: Number(simExercise),
        resistanceLoadPct: Number(simLoad)
      })
    });
    twin = res.data;
  }

  async function sendOpsMessage() {
    if (!newOpsBody.trim()) return;
    await api('/ops/messages', {
      method: 'POST',
      body: JSON.stringify(
        withClientMeta({
          crewId: selectedId,
          body: newOpsBody.trim()
        })
      )
    });
    newOpsBody = '';
    await loadActiveTab(selectedId, 'ops');
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || streamingChat) return;
    chatInput = '';
    chatMessages = [...chatMessages, { role: 'user', content: text }, { role: 'assistant', context: '', content: '' }];
    const idx = chatMessages.length - 1;
    streamingChat = true;
    chatAbort = new AbortController();

    try {
      await streamCopilot({
        crewId: selectedId,
        messages: chatMessages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
        signal: chatAbort.signal,
        onContext(ctx) {
          const parts = [];
          if (ctx.vitals) parts.push(ctx.vitals);
          if (ctx.alerts) parts.push(ctx.alerts);
          if (ctx.environment) parts.push(ctx.environment);
          chatMessages[idx].context = parts.join(' · ');
          chatMessages = [...chatMessages];
        },
        onToken(token) {
          chatMessages[idx].content += token;
          chatMessages = [...chatMessages];
        },
        onDone(meta) {
          if (meta?.triageLevel) {
            chatMessages[idx].triage = meta.triageLevel;
            chatMessages = [...chatMessages];
          }
        },
        onError(err) {
          chatMessages[idx].content += `\n[Aviso: ${err}]`;
          chatMessages = [...chatMessages];
        }
      });
    } finally {
      streamingChat = false;
      chatAbort = null;
    }
  }

  onMount(() => {
    loadCore();

    const clock = setInterval(() => {
      if (!mission?.missionTime) return;
      const next = new Date(new Date(mission.missionTime).getTime() + 1000 * (mission.timeScale || 1));
      mission = { ...mission, missionTime: next.toISOString() };
    }, 1000);

    const stopStream = connectStream({
      mission(data) {
        mission = data;
      },
      vital(v) {
        if (v.crewId === selectedId && overview?.vitals) {
          overview = {
            ...overview,
            vitals: overview.vitals.map((item) => (item.metric === v.metric ? v : item))
          };
        }
      },
      healthScore(hs) {
        crew = crew.map((m) =>
          m.id === hs.crewId ? { ...m, healthScore: { ...m.healthScore, score: hs.score, level: hs.level } } : m
        );
      },
      alert(a) {
        if (a.crewId === null || a.crewId === selectedId) {
          alerts = [a, ...alerts.filter((x) => x.id !== a.id)];
        }
      },
      alertUpdated(upd) {
        alerts = alerts
          .map((a) => (a.id === upd.id ? { ...a, ...upd } : a))
          .filter((a) => a.status !== 'resolved');
      },
      task(t) {
        if (t.crewId === selectedId) {
          tasks = [t, ...tasks.filter((x) => x.id !== t.id)];
        }
      },
      scenario(sc) {
        mission = { ...mission, scenario: sc.state === 'started' ? sc : null };
      },
      opsMessage(msg) {
        if (tab === 'ops') {
          opsMessages = [msg, ...opsMessages.filter((x) => x.id !== msg.id)];
        }
      }
    });

    const onOnline = () => flushOfflineQueue();
    window.addEventListener('online', onOnline);

    return () => {
      clearInterval(clock);
      clearTimeout(pvtTimer);
      stopStream();
      window.removeEventListener('online', onOnline);
    };
  });
</script>

<div class="app">
  <!-- Barra superior de misión -->
  <header class="bar">
    <h1>CHIEF · MISIÓN</h1>
    <div class="it"><small>Día de misión</small><b class="mono">{mission.missionDay}</b></div>
    <div class="it"><small>Hora UTC</small><b class="mono">{formatUtc(mission.missionTime)}</b></div>
    <div class="it"><small>Retraso a Tierra</small><b class="mono">{formatDelay(mission.commDelaySec)}</b></div>
    <div class="it"><small>ISS</small><b>{mission.iss?.inSAA ? 'Dentro de la SAA' : 'Fuera de SAA'}</b></div>
    <div class="it">
      <small>Kp</small>
      <b class="mono" style="color:{K(mission.spaceWeather?.level || 'critical')}">
        {String(mission.spaceWeather?.kp ?? '5.3').replace('.', ',')}
      </b>
    </div>
    <div class="it">
      <small>Datos</small>
      <b style="color:{mission.dataMode === 'live' ? '#6bd18a' : '#f0d84a'}">
        {mission.dataMode === 'live' ? 'En vivo' : 'Caché'}
      </b>
    </div>
    {#if mission.scenario}
      <span class="ban">Escenario: {mission.scenario.name}</span>
    {/if}
    {#if staleNote}
      <span class="ban" style="background:#4a3d18;color:#f0d84a">{staleNote}</span>
    {/if}
    <span class="sp"></span>
    <button type="button" class="btn" aria-expanded={scOpen} on:click={() => (scOpen = !scOpen)}>
      Escenarios
    </button>
  </header>

  {#if scOpen}
    <div class="pop" role="menu">
      {#each scenarios as s}
        <button
          type="button"
          class="btn"
          style="width:100%;margin-bottom:6px;text-align:left"
          on:click={() => toggleScenario(s.code)}
        >
          {s.name}
        </button>
      {/each}
      <button type="button" class="btn" style="width:100%" on:click={() => toggleScenario(null)}>
        Detener escenario
      </button>
    </div>
  {/if}

  <!-- Pestañas superiores de tripulantes: al pulsar cualquiera abre su Resumen (overview) -->
  <div class="crewbar" role="tablist" aria-label="Tripulación y resumen">
    {#each crew as member}
      <button
        type="button"
        role="tab"
        class="ct"
        class:on={member.id === selectedId && tab === 'ov'}
        class:selected={member.id === selectedId && tab !== 'ov'}
        aria-selected={member.id === selectedId && tab === 'ov'}
        on:click={() => selectCrewOverview(member.id)}
      >
        <i class="dot" style="background:{K(member.healthScore?.level)}"></i>
        <span>
          {member.name}
          <small>{member.role} · Resumen · {L(member.healthScore?.level)}</small>
        </span>
        <span class="sc" style="color:{K(member.healthScore?.level)}">
          {member.healthScore?.score === null || member.healthScore?.score === undefined
            ? '—'
            : member.healthScore.score}
        </span>
      </button>
    {/each}
  </div>

  <!-- Cuerpo principal de 3 columnas -->
  <div class="body">
    <!-- Menú lateral izquierdo (sin Resumen) -->
    <nav class="side" aria-label="Vistas">
      <h2>Vistas</h2>
      {#each TABS as t}
        <button
          type="button"
          class="tab"
          class:on={tab === t[0]}
          aria-pressed={tab === t[0]}
          on:click={() => (tab = t[0])}
        >
          {t[1]}
        </button>
      {/each}
      <button type="button" class="btn cop" on:click={() => (chat = !chat)}>
        Copiloto IA
      </button>
    </nav>

    <!-- Zona central -->
    <main class="main">
      {#if tab === 'home'}
        <div class="ttl">
          <h2>Inicio: salud de la tripulación</h2>
          <span>GET /crew</span>
        </div>
        <div class="g4">
          {#each crew as member}
            <button
              type="button"
              class="card card-btn"
              style="border-left-color:{K(member.healthScore?.level)}"
              on:click={() => selectCrewOverview(member.id)}
            >
              <div class="lvl" style="color:{K(member.healthScore?.level)}">
                {L(member.healthScore?.level)} · Ver resumen
              </div>
              <div class="big" style="color:{K(member.healthScore?.level)}">
                {member.healthScore?.score ?? '—'}
              </div>
              <b style="color:#fff;font-size:17px">{member.name}</b>
              <div style="color:#9aa3ac">{member.role}</div>
            </button>
          {/each}
        </div>
        <div class="pn">
          <h3>Desglose por módulo: {c.name}</h3>
          {#if c.healthScore?.components?.length}
            {#each c.healthScore.components as k}
              <div class="row">
                <span>{MODULE_LABELS[k.module] || k.module}</span>
                <div class="trk"><i style="width:{k.score || 0}%;background:{K(k.level)}"></i></div>
                <b class="mono" style="width:34px">{k.score ?? '—'}</b>
                <span class="lvl" style="width:72px;color:{K(k.level)}">{L(k.level)}</span>
              </div>
            {/each}
          {:else}
            <div style="color:#9aa3ac">Sin desglose de módulos disponible para {c.name}.</div>
          {/if}
        </div>

      {:else if tab === 'ov'}
        <div class="ttl">
          <h2>Resumen: {c.name}</h2>
          <span>GET /crew/{c.id}/overview</span>
        </div>
        <div class="ov">
          <div style="display:flex;flex-direction:column;gap:14px;min-width:0">
            <div class="card" style="border-left-color:{K(c.healthScore?.level)}">
              <div class="lvl" style="color:{K(c.healthScore?.level)}">
                Health Score · {L(c.healthScore?.level)}
              </div>
              <div class="big" style="color:{K(c.healthScore?.level)}">
                {c.healthScore?.score ?? '—'}<small style="font-size:18px;color:#9aa3ac"> / 100</small>
              </div>
            </div>

            <div class="pn">
              <h3>Constantes actuales</h3>
              {#if overview?.vitals?.length}
                <div class="vit">
                  {#each overview.vitals as v}
                    <div class="card" style="border-left-color:{K(v.level)}">
                      <div style="color:#9aa3ac;font-size:12px;text-transform:uppercase">
                        {METRIC_LABELS[v.metric] || v.metric}
                      </div>
                      <div class="big" style="font-size:38px;color:{K(v.level)}">
                        {v.value}<small style="font-size:14px;color:#9aa3ac"> {v.unit}</small>
                      </div>
                      <div class="lvl" style="color:{K(v.level)}">{L(v.level)}</div>
                      <div style="font-size:11px;color:#9aa3ac">
                        {v.source === 'manual' ? 'Manual' : 'Simulado'}
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div style="color:#9aa3ac">Sin mediciones registradas para este tripulante.</div>
              {/if}
            </div>

            {#if countermeasures.length}
              <div class="pn">
                <h3>Contramedidas activas</h3>
                {#each countermeasures as cm}
                  <div class="row" style="justify-content:space-between;border-top:1px solid #2b323a;padding-top:8px">
                    <div>
                      <b style="color:#fff">{cm.title}</b>
                      <div style="font-size:12px;color:#9aa3ac">Regla: {cm.rule}</div>
                    </div>
                    <span class="lvl" style="color:{cm.priority === 'high' ? '#ff5a4e' : '#3fb6d8'}">
                      {cm.priority === 'high' ? 'Alta' : 'Normal'}
                    </span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <div class="pn" style="display:flex;flex-direction:column;align-items:center;gap:8px">
            <svg viewBox="0 0 120 256" role="img" aria-label="Silueta con zonas por nivel" style="height:380px;width:auto">
              <path
                d="M60 8 C50 8 44 15 44 24 C44 31 48 37 52 40 L52 46 C40 48 28 52 24 60 L16 110 L24 112 L32 80 L34 120 L38 150 L42 240 L52 244 L56 160 L60 156 L64 160 L68 244 L78 240 L82 150 L86 120 L88 80 L96 112 L104 110 L96 60 C92 52 80 48 68 46 L68 40 C72 37 76 31 76 24 C76 15 70 8 60 8 Z"
                fill="#2a3139"
                stroke="#5a636d"
                stroke-width="1.5"
                stroke-linejoin="round"
              />
              {#each zones as z}
                <circle
                  cx={z.x}
                  cy={z.y}
                  r={z.r}
                  fill={z.col}
                  stroke={z.stroke}
                  stroke-width={z.sw}
                  tabindex="0"
                  role="button"
                  aria-label="{z.name}: {z.lvl}"
                  style="cursor:pointer"
                  on:click={() => (selectedZone = z.key)}
                  on:keydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') selectedZone = z.key;
                  }}
                />
              {/each}
            </svg>

            <div class="det">
              <b style="color:#fff">{zsel.name}</b>
              <span class="lvl" style="color:{zsel.col}">{zsel.lvl}</span><br />
              {zsel.reason}
            </div>

            <div class="leg">
              <span><i style="background:#6bd18a"></i>Normal</span>
              <span><i style="background:#f0d84a"></i>Vigilar</span>
              <span><i style="background:#f59e42"></i>Aviso</span>
              <span><i style="background:#ff5a4e"></i>Crítico</span>
              <span><i style="background:#8b949e"></i>Sin datos</span>
            </div>
          </div>
        </div>

      {:else if tab === 'vit'}
        <div class="ttl">
          <h2>Constantes: {c.name}</h2>
          <span>GET /crew/{c.id}/vitals?metric={selectedMetric}&bucket=5m</span>
        </div>
        <div class="pn">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
            {#each Object.entries(METRIC_LABELS) as [mKey, mLabel]}
              <button
                type="button"
                class="btn"
                style={selectedMetric === mKey ? 'background:#1f3340;border-color:#3fb6d8;color:#fff' : ''}
                on:click={() => {
                  selectedMetric = mKey;
                  loadActiveTab(selectedId, 'vit');
                }}
              >
                {mLabel}
              </button>
            {/each}
          </div>

          {#if vitalSeries?.points?.length}
            <div style="margin-bottom:10px;color:#9aa3ac">
              Línea base: <b class="mono" style="color:#fff">{vitalSeries.baseline} {vitalSeries.unit}</b>
            </div>
            <div class="g4">
              {#each vitalSeries.points as pt}
                <div class="card" style="border-left-color:#3fb6d8;padding:10px 12px">
                  <div class="mono" style="font-size:12px;color:#9aa3ac">{formatUtc(pt.t)} UTC</div>
                  <div class="mono" style="font-size:24px;color:#fff">
                    {pt.value} <small style="font-size:12px;color:#9aa3ac">{vitalSeries.unit}</small>
                  </div>
                  <div style="font-size:11px;color:#9aa3ac">Rango: {pt.min}–{pt.max}</div>
                </div>
              {/each}
            </div>
          {:else}
            <div style="color:#9aa3ac">Sin serie temporal para esta métrica.</div>
          {/if}
        </div>

        <div class="pn">
          <h3>Registrar medición manual (POST /crew/{c.id}/vitals)</h3>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <select bind:value={newVitalMetric} class="inp">
              {#each Object.entries(METRIC_LABELS) as [mKey, mLabel]}
                <option value={mKey}>{mLabel}</option>
              {/each}
            </select>
            <input type="number" step="0.1" placeholder="Valor" bind:value={newVitalValue} class="inp" />
            <button type="button" class="btn" on:click={submitManualVital}>Guardar medición</button>
          </div>
        </div>

      {:else if tab === 'sleep'}
        <div class="ttl">
          <h2>Sueño: {c.name}</h2>
          <span>GET /crew/{c.id}/sleep?days=7</span>
        </div>
        <div class="g4">
          {#each sleepList as s}
            <div class="card" style="border-left-color:{K(s.level)}">
              <div class="lvl" style="color:{K(s.level)}">{s.date} · {L(s.level)}</div>
              <div class="big" style="font-size:36px;color:{K(s.level)}">
                {(s.durationMin / 60).toFixed(1)}<small style="font-size:14px;color:#9aa3ac"> h</small>
              </div>
              <div>Eficiencia: <b class="mono">{s.efficiencyPct}%</b> · Desfase: <b class="mono">{s.circadianShiftMin} min</b></div>
              {#if s.phases}
                <div style="margin-top:8px;font-size:12px;color:#9aa3ac">
                  Profundo {s.phases.deepMin}m · REM {s.phases.remMin}m · Ligero {s.phases.lightMin}m
                </div>
              {/if}
            </div>
          {/each}
        </div>

      {:else if tab === 'cog'}
        <div class="ttl">
          <h2>Fatiga y test PVT: {c.name}</h2>
          <span>GET / POST /crew/{c.id}/cognitive</span>
        </div>
        <div class="pn">
          <h3>Test de vigilancia psicomotora (PVT)</h3>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            <button type="button" class="btn" on:click={startPvtTest}>Iniciar test rápido</button>
            {#if pvtState === 'waiting'}
              <div class="pvt-box" style="background:#5a2a26">Espera al estímulo verde...</div>
            {:else if pvtState === 'ready'}
              <button type="button" class="pvt-box" style="background:#2d7a47;cursor:pointer" on:click={hitPvtTarget}>
                ¡PULSA AHORA!
              </button>
            {:else if pvtState === 'result'}
              <div class="pvt-box" style="background:#1f3340">
                Tiempo registrado: <b class="mono">{pvtLastMs} ms</b>
              </div>
            {/if}
          </div>
        </div>
        <div class="g4">
          {#each cognitiveList as item}
            <div class="card" style="border-left-color:{K(item.level)}">
              <div class="lvl" style="color:{K(item.level)}">{L(item.level)}</div>
              <div class="big" style="font-size:36px;color:{K(item.level)}">
                {item.meanReactionMs}<small style="font-size:14px;color:#9aa3ac"> ms</small>
              </div>
              <div>Lapsos (&gt;500 ms): <b class="mono">{item.lapses}</b> · Base: {item.baselineMs} ms</div>
            </div>
          {/each}
        </div>

      {:else if tab === 'well'}
        <div class="ttl">
          <h2>Bienestar, síntomas y nutrición: {c.name}</h2>
          <span>GET / POST /crew/{c.id}/wellbeing · symptoms · nutrition</span>
        </div>
        <div class="ov">
          <div class="pn">
            <h3>Registrar diario (1 peor – 5 mejor)</h3>
            <div class="row"><span>Ánimo</span><input type="range" min="1" max="5" bind:value={wbMood} /><b class="mono">{wbMood}/5</b></div>
            <div class="row"><span>Aislamiento</span><input type="range" min="1" max="5" bind:value={wbIsolation} /><b class="mono">{wbIsolation}/5</b></div>
            <div class="row"><span>Convivencia</span><input type="range" min="1" max="5" bind:value={wbCohab} /><b class="mono">{wbCohab}/5</b></div>
            <div style="display:flex;gap:8px;margin-top:8px">
              <input type="text" placeholder="Nota opcional..." bind:value={wbNote} class="inp" style="flex:1" />
              <button type="button" class="btn" on:click={submitWellbeing}>Guardar diario</button>
            </div>

            <h3 style="margin-top:18px">Registrar síntoma (1 leve – 5 grave)</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <select bind:value={symType} class="inp">
                {#each Object.entries(SYMPTOM_LABELS) as [sk, sl]}
                  <option value={sk}>{sl}</option>
                {/each}
              </select>
              <input type="number" min="1" max="5" bind:value={symSeverity} class="inp" style="width:70px" />
              <input type="text" placeholder="Detalle..." bind:value={symNote} class="inp" style="flex:1" />
              <button type="button" class="btn" on:click={submitSymptom}>Añadir</button>
            </div>
          </div>

          <div class="pn">
            <h3>Nutrición diaria</h3>
            {#each nutritionList as n}
              <div style="margin-bottom:10px">
                <div>Calorías: <b class="mono">{n.kcal} / {n.targetKcal} kcal</b></div>
                <div>Proteína: <b class="mono">{n.proteinG} / {n.targetProteinG} g</b></div>
                <div>Hidratación: <b class="mono">{n.hydrationMl} / {n.targetHydrationMl} ml</b></div>
              </div>
            {/each}
            <h3>Síntomas recientes</h3>
            {#each symptomsList as sy}
              <div class="li" style="border-left-color:{sy.severity >= 4 ? '#ff5a4e' : '#f0d84a'}">
                <b>{SYMPTOM_LABELS[sy.symptom] || sy.symptom} · Severidad {sy.severity}/5</b>
                <span>{sy.note || 'Sin observaciones'}</span>
              </div>
            {/each}
          </div>
        </div>

      {:else if tab === 'med'}
        <div class="ttl">
          <h2>Ficha médica y analíticas: {c.name}</h2>
          <span>GET /crew/{c.id}/medical · labs</span>
        </div>
        {#if medical}
          <div class="pn">
            <h3>Perfil clínico</h3>
            <div>Grupo sanguíneo: <b>{medical.bloodType}</b> · Edad: <b>{medical.age}</b> · Peso: <b>{medical.weightKg} kg</b></div>
            <div>Alergias: <b>{medical.allergies?.join(', ') || 'Ninguna'}</b></div>
            <div>Medicación: <b>{medical.medications?.map((m) => `${m.name} (${m.dose})`).join(' · ') || 'Ninguna'}</b></div>
          </div>
        {/if}
        <div class="pn">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <h3 style="margin:0">Paneles analíticos</h3>
            <select
              bind:value={labPhase}
              class="inp"
              on:change={() => loadActiveTab(selectedId, 'med')}
            >
              <option value="all">Todas las fases</option>
              <option value="pre_flight">Pre-vuelo</option>
              <option value="in_flight">En vuelo</option>
              <option value="post_flight">Post-vuelo</option>
            </select>
          </div>
          {#each labs as panel}
            <div style="margin-bottom:14px">
              <b style="color:#fff;text-transform:uppercase">{panel.panel} ({panel.phase})</b>
              <div class="g4" style="margin-top:8px">
                {#each panel.analytes as an}
                  <div class="card" style="border-left-color:{K(an.level)};padding:10px 12px">
                    <div style="font-size:12px;color:#9aa3ac">{an.name}</div>
                    <div class="mono" style="font-size:24px;color:{K(an.level)}">
                      {an.value} <small style="font-size:12px">{an.unit}</small>
                    </div>
                    <div style="font-size:11px;color:#9aa3ac">
                      Ref: {an.refLow}–{an.refHigh} · Δ {an.deltaPct > 0 ? `+${an.deltaPct}` : an.deltaPct}%
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>

      {:else if tab === 'twin'}
        <div class="ttl">
          <h2>Gemelo digital (180 días): {c.name}</h2>
          <span>GET / POST /crew/{c.id}/twin/simulate</span>
        </div>
        <div class="pn">
          <h3>Simulador de carga de ejercicio</h3>
          <div class="row">
            <span>Ejercicio diario</span>
            <input type="range" min="30" max="150" step="10" bind:value={simExercise} />
            <b class="mono" style="width:76px">{simExercise} min</b>
          </div>
          <div class="row">
            <span>Carga resistiva</span>
            <input type="range" min="20" max="100" step="5" bind:value={simLoad} />
            <b class="mono" style="width:76px">{simLoad} %</b>
          </div>
          <button type="button" class="btn" on:click={simulateTwin}>Recalcular proyección</button>
        </div>
        {#if twin?.points}
          <div class="g4">
            {#each twin.points as p}
              <div class="card" style="border-left-color:{p.boneDensityLossPct > 4 ? '#f59e42' : '#6bd18a'}">
                <div class="lvl">Día +{p.day}</div>
                <div>Pérdida ósea: <b class="mono" style="color:#f59e42">-{p.boneDensityLossPct}%</b></div>
                <div>Pérdida muscular: <b class="mono" style="color:#f0d84a">-{p.muscleMassLossPct}%</b></div>
              </div>
            {/each}
          </div>
        {/if}

      {:else if tab === 'env'}
        <div class="ttl">
          <h2>Entorno espacial y cabina</h2>
          <span>GET /environment/space-weather · iss-position · cabin</span>
        </div>
        <div class="g4">
          <div class="card" style="border-left-color:#ff5a4e">
            <div class="lvl" style="color:#ff5a4e">Clima espacial</div>
            <div class="big" style="color:#ff5a4e">{spaceWeather?.kp ?? mission.spaceWeather?.kp}</div>
            <div>Índice Kp · Protones: <b class="mono">{spaceWeather?.protonFluxPfu ?? 120} pfu</b></div>
          </div>
          <div class="card" style="border-left-color:#f59e42">
            <div class="lvl" style="color:#f59e42">Órbita ISS</div>
            <div class="big" style="color:#f59e42;font-size:34px">
              {(issPos?.inSAA ?? mission.iss?.inSAA) ? 'SAA' : 'NOMINAL'}
            </div>
            <div>
              Lat {issPos?.lat ?? mission.iss?.lat} · Lon {issPos?.lon ?? mission.iss?.lon} · {issPos?.altKm ?? 418} km
            </div>
          </div>
          {#if cabin}
            <div class="card" style="border-left-color:#f0d84a">
              <div class="lvl" style="color:#f0d84a">Atmósfera de cabina</div>
              <div class="big" style="color:#f0d84a;font-size:34px">{cabin.co2 ?? 4.1} mmHg</div>
              <div>CO₂ · O₂: <b class="mono">{cabin.o2 ?? 20.9}%</b> · Presión: <b class="mono">{cabin.cabinPressure ?? 101.2} kPa</b></div>
            </div>
          {/if}
        </div>
        {#if correlations.length}
          <div class="pn">
            <h3>Correlaciones detectadas</h3>
            {#each correlations as cor}
              <div class="li" style="border-left-color:#3fb6d8">
                <b>{cor.factorA} ↔ {cor.factorB} (r = {cor.r})</b>
                <span>{cor.summary}</span>
              </div>
            {/each}
          </div>
        {/if}

      {:else if tab === 'ops'}
        <div class="ttl">
          <h2>Control de Tierra</h2>
          <span>GET / POST /ops/messages (Retraso actual: {formatDelay(mission.commDelaySec)})</span>
        </div>
        <div class="pn">
          <div style="display:flex;gap:8px">
            <input
              type="text"
              placeholder="Escribir mensaje a Houston / Control de Misión..."
              bind:value={newOpsBody}
              class="inp"
              style="flex:1"
              on:keydown={(e) => e.key === 'Enter' && sendOpsMessage()}
            />
            <button type="button" class="btn" on:click={sendOpsMessage}>Enviar</button>
          </div>
        </div>
        <div class="pn">
          <h3>Historial de comunicaciones y telemetría</h3>
          {#each opsMessages as m}
            <div class="li" style="border-left-color:{m.direction === 'ground_to_crew' ? '#6bd18a' : '#3fb6d8'}">
              <b>
                {m.direction === 'ground_to_crew' ? 'Tierra → Nave' : 'Nave → Tierra'} · {m.kind}
              </b>
              <div style="color:#d3d8de;margin:4px 0">{m.body}</div>
              <span>
                Enviado: {formatUtc(m.createdAt)} UTC · Entrega estimada: {formatUtc(m.deliverAt)} UTC
                ({m.delivered ? 'Entregado' : 'En tránsito'})
              </span>
            </div>
          {/each}
        </div>

      {:else}
        <div class="ttl">
          <h2>{tb ? tb[1] : 'Resumen'}</h2>
          <span>GET {tb ? tb[2] : `/crew/${selectedId}/overview`}</span>
        </div>
      {/if}

      <div class="disc">Datos simulados. No es consejo médico.</div>
    </main>

    <!-- Panel derecho plegable de Alertas y Tareas -->
    <aside class="rt" class:shut={!open} aria-label="Alertas y tareas">
      <div class="rth">
        {#if open}
          <button type="button" class="rtab" class:on={rt === 'a'} on:click={() => (rt = 'a')}>
            Alertas<span class="cnt">{openAlertsCount}</span>
          </button>
          <button type="button" class="rtab" class:on={rt === 't'} on:click={() => (rt = 't')}>
            Tareas<span class="cnt" style="background:#3fb6d8">{tasks.length}</span>
          </button>
        {/if}
        <button
          type="button"
          class="btn"
          style="min-width:44px;padding:0"
          aria-expanded={open}
          aria-label="Plegar panel de alertas y tareas"
          on:click={() => (open = !open)}
        >
          {open ? '›' : '‹'}
        </button>
      </div>

      {#if open}
        {#if rt === 'a'}
          {#each alerts as a}
            <div class="li" style="border-left-color:{K(a.level)}">
              <b>{a.title}</b>
              <span style="color:{K(a.level)};font-weight:600">{L(a.level).toUpperCase()} · {a.status}</span>
              <div style="font-size:12px;color:#c0c7ce;margin:3px 0">{a.message}</div>
              <div style="display:flex;gap:6px;margin-top:6px">
                {#if a.status === 'active' || a.status === 'pending_ground'}
                  <button type="button" class="btn-sm" on:click={() => updateAlertStatus(a.id, 'ack')}>
                    Enterado (ACK)
                  </button>
                {/if}
                {#if a.status !== 'pending_ground'}
                  <button type="button" class="btn-sm" on:click={() => updateAlertStatus(a.id, 'resolved')}>
                    Resolver
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        {:else}
          {#each tasks as t}
            <div class="li" style="border-left-color:{t.priority === 'high' ? '#ff5a4e' : '#6bd18a'}">
              <b>{t.title}</b>
              <span style="color:{t.priority === 'high' ? '#ff5a4e' : '#6bd18a'};font-weight:600">
                {t.priority === 'high' ? 'ALTA' : 'NORMAL'}
              </span>
              <span>{t.type} · vence {formatUtc(t.dueAt)} UTC</span>
              <div style="margin-top:6px">
                <button type="button" class="btn-sm" on:click={() => completeTask(t)}>Completar</button>
              </div>
            </div>
          {/each}
        {/if}
      {/if}
    </aside>
  </div>

  <!-- Ventana flotante del Copiloto IA -->
  {#if chat}
    <div class="chat">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b style="color:#fff">Copiloto IA · {c.name}</b>
        <button type="button" class="btn-sm" on:click={() => (chat = false)}>Cerrar</button>
      </div>
      <div style="max-height:240px;overflow-y:auto;margin:6px 0">
        {#each chatMessages as m}
          <div class="msg" class:me={m.role === 'user'}>
            {#if m.context}
              <span style="color:#9aa3ac;font-size:12px">He tenido en cuenta: {m.context}</span><br />
            {/if}
            {m.content}
          </div>
        {/each}
      </div>
      <div style="display:flex;gap:6px">
        <input
          type="text"
          placeholder="Consulta al copiloto médico..."
          bind:value={chatInput}
          class="inp"
          style="flex:1"
          on:keydown={(e) => e.key === 'Enter' && sendChat()}
        />
        {#if streamingChat}
          <button type="button" class="btn" on:click={() => chatAbort?.abort()}>Parar</button>
        {:else}
          <button type="button" class="btn" on:click={sendChat}>Enviar</button>
        {/if}
      </div>
      <div style="font-size:11px;color:#9aa3ac;margin-top:6px">
        Asistente simulado. No sustituye criterio médico.
      </div>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    background: #12151a;
  }

  .app {
    font-family: Inter, system-ui, sans-serif;
    color: #d3d8de;
    background: #12151a;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    font-size: 14px;
    position: relative;
  }

  .mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 22px;
    padding: 8px 16px;
    background: #1b2027;
    border-bottom: 1px solid #333a42;
  }

  .bar h1 {
    margin: 0;
    font-size: 15px;
    color: #fff;
    letter-spacing: 0.08em;
  }

  .it small {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #9aa3ac;
  }

  .it b {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
  }

  .sp {
    flex: 1;
  }

  .btn {
    min-height: 44px;
    padding: 0 14px;
    background: #2a3038;
    color: #d3d8de;
    border: 1px solid #444d57;
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
  }

  .btn:hover {
    background: #343b44;
    color: #fff;
  }

  .btn-sm {
    min-height: 30px;
    padding: 0 10px;
    background: #2a3038;
    color: #d3d8de;
    border: 1px solid #444d57;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  .btn-sm:hover {
    background: #343b44;
    color: #fff;
  }

  .inp {
    min-height: 38px;
    padding: 0 10px;
    background: #15191f;
    color: #fff;
    border: 1px solid #444d57;
    border-radius: 4px;
    font: inherit;
  }

  .ban {
    padding: 6px 12px;
    border-radius: 4px;
    background: #5a2a26;
    color: #fff;
    font-weight: 600;
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .side {
    width: 232px;
    flex: none;
    background: #171b20;
    border-right: 1px solid #333a42;
    display: flex;
    flex-direction: column;
    padding: 10px 0;
  }

  .side h2 {
    margin: 8px 14px 6px;
    font-size: 11px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #9aa3ac;
  }

  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex: none;
  }

  .tab {
    display: block;
    width: 100%;
    min-height: 42px;
    padding: 0 14px;
    background: none;
    border: 0;
    border-left: 4px solid transparent;
    color: #d3d8de;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .tab:hover {
    background: #222830;
  }

  .tab.on {
    background: #1f3340;
    border-left-color: #3fb6d8;
    color: #fff;
  }

  .cop {
    margin: auto 12px 4px;
    min-height: 52px;
    background: #1f6f8a;
    border-color: #3fb6d8;
    color: #fff;
    font-weight: 600;
  }

  .cop:hover {
    background: #2682a1;
  }

  .main {
    flex: 1;
    min-width: 0;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .ttl {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
  }

  .ttl h2 {
    margin: 0;
    font-size: 22px;
    color: #fff;
  }

  .ttl span {
    color: #9aa3ac;
  }

  .pn {
    background: #1e242b;
    border: 1px solid #333a42;
    border-radius: 4px;
    padding: 14px;
    min-width: 0;
  }

  .pn h3 {
    margin: 0 0 10px;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9aa3ac;
  }

  .g4 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 14px;
  }

  .card {
    border-left: 8px solid #6bd18a;
    background: #1e242b;
    border-radius: 4px;
    padding: 14px 16px;
    border-top: 1px solid #333a42;
    border-right: 1px solid #333a42;
    border-bottom: 1px solid #333a42;
    text-align: left;
  }

  .card-btn {
    cursor: pointer;
    font: inherit;
    color: inherit;
  }

  .card-btn:hover {
    background: #252c35;
  }

  .big {
    font-family: 'JetBrains Mono', monospace;
    font-size: 56px;
    font-weight: 500;
    line-height: 1;
  }

  .lvl {
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.04em;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 7px 0;
  }

  .row span:first-child {
    width: 112px;
    color: #c0c7ce;
  }

  .trk {
    flex: 1;
    height: 10px;
    background: #2b323a;
    border-radius: 5px;
    overflow: hidden;
  }

  .trk i {
    display: block;
    height: 100%;
  }

  .ov {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 14px;
    align-items: start;
  }

  .vit {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 10px;
  }

  .pvt-box {
    padding: 12px 22px;
    border-radius: 6px;
    border: 1px solid #444d57;
    color: #fff;
    font-weight: 600;
  }

  .rt {
    width: 310px;
    flex: none;
    background: #171b20;
    border-left: 1px solid #333a42;
    display: flex;
    flex-direction: column;
  }

  .rt.shut {
    width: 56px;
    align-items: center;
  }

  .rth {
    display: flex;
    gap: 6px;
    padding: 8px;
  }

  .rtab {
    flex: 1;
    min-height: 44px;
    background: #222830;
    border: 1px solid #3a424b;
    border-radius: 4px;
    color: #d3d8de;
    font: inherit;
    cursor: pointer;
  }

  .rtab.on {
    background: #1f3340;
    border-color: #3fb6d8;
    color: #fff;
  }

  .cnt {
    display: inline-block;
    min-width: 22px;
    padding: 1px 6px;
    margin-left: 6px;
    border-radius: 10px;
    background: #ff5a4e;
    color: #10141a;
    font-weight: 700;
    font-size: 12px;
  }

  .li {
    padding: 10px 14px;
    border-top: 1px solid #2b323a;
    border-left: 6px solid #6bd18a;
  }

  .li b {
    color: #fff;
    display: block;
  }

  .li span {
    font-size: 12px;
    color: #9aa3ac;
  }

  .pop {
    position: absolute;
    top: 58px;
    right: 16px;
    z-index: 5;
    width: 250px;
    background: #232a32;
    border: 1px solid #4a5560;
    border-radius: 4px;
    padding: 8px;
  }

  .chat {
    position: fixed;
    left: 244px;
    bottom: 12px;
    z-index: 10;
    width: 430px;
    background: #1e242b;
    border: 1px solid #3fb6d8;
    border-radius: 6px;
    padding: 14px;
    line-height: 1.5;
  }

  .msg {
    padding: 8px 10px;
    border-radius: 4px;
    background: #2a3139;
    margin: 6px 0;
  }

  .msg.me {
    background: #1f3340;
  }

  .crewbar {
    display: flex;
    gap: 6px;
    padding: 8px 16px 0;
    background: #171b20;
    border-bottom: 1px solid #333a42;
    overflow-x: auto;
  }

  .ct {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 58px;
    padding: 0 20px;
    background: #222830;
    border: 1px solid #3a424b;
    border-bottom: 4px solid transparent;
    border-radius: 4px 4px 0 0;
    color: #d3d8de;
    font: inherit;
    cursor: pointer;
    white-space: nowrap;
    text-align: left;
  }

  .ct:hover {
    background: #2a323b;
  }

  .ct.selected {
    border-color: #566370;
    border-bottom-color: #6b7b8c;
    color: #fff;
  }

  .ct.on {
    background: #1f3340;
    border-bottom-color: #3fb6d8;
    color: #fff;
  }

  .ct small {
    display: block;
    font-size: 11px;
    color: #9aa3ac;
  }

  .ct .sc {
    font-weight: 700;
    font-size: 22px;
    font-family: 'JetBrains Mono', monospace;
  }

  .det {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    background: #1a1f25;
    border-radius: 4px;
    line-height: 1.5;
    font-size: 13px;
  }

  .leg {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 12px;
    color: #c0c7ce;
  }

  .leg i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 4px;
  }

  .disc {
    margin-top: auto;
    color: #9aa3ac;
    font-size: 12px;
  }

  @media (max-width: 900px) {
    .body {
      flex-direction: column;
    }
    .side,
    .rt,
    .rt.shut {
      width: auto;
      border: 0;
    }
    .ov {
      grid-template-columns: 1fr;
    }
    .chat {
      left: 8px;
      right: 8px;
      width: auto;
    }
  }
</style>
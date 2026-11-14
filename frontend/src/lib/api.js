import missionStatusMock from '../mocks/mission-status.json';
import crewMock from '../mocks/crew.json';
import overviewMock from '../mocks/overview.json';
import vitalsMock from '../mocks/vitals.json';
import healthScoresMock from '../mocks/health-scores.json';
import sleepMock from '../mocks/sleep.json';
import cognitiveMock from '../mocks/cognitive.json';
import nutritionMock from '../mocks/nutrition.json';
import wellbeingMock from '../mocks/wellbeing.json';
import symptomsMock from '../mocks/symptoms.json';
import medicalMock from '../mocks/medical.json';
import labsMock from '../mocks/labs.json';
import twinMock from '../mocks/twin.json';
import countermeasuresMock from '../mocks/countermeasures.json';
import correlationsMock from '../mocks/correlations.json';
import alertsMock from '../mocks/alerts.json';
import tasksMock from '../mocks/tasks.json';
import spaceWeatherMock from '../mocks/space-weather.json';
import issPositionMock from '../mocks/iss-position.json';
import cabinMock from '../mocks/cabin.json';
import opsMessagesMock from '../mocks/ops-messages.json';
import scenariosMock from '../mocks/scenarios.json';

import {
  saveGetCache,
  readGetCache,
  enqueueMutation,
  getQueuedMutations,
  deleteQueuedMutation
} from './cache.js';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false';

// Estado mutable en memoria para que las mutaciones en modo mock funcionen de verdad
const mockStore = {
  mission: structuredClone(missionStatusMock),
  crew: structuredClone(crewMock),
  overview: structuredClone(overviewMock),
  vitals: structuredClone(vitalsMock),
  sleep: structuredClone(sleepMock),
  cognitive: structuredClone(cognitiveMock),
  nutrition: structuredClone(nutritionMock),
  wellbeing: structuredClone(wellbeingMock),
  symptoms: structuredClone(symptomsMock),
  medical: structuredClone(medicalMock),
  labs: structuredClone(labsMock),
  twin: structuredClone(twinMock),
  countermeasures: structuredClone(countermeasuresMock),
  correlations: structuredClone(correlationsMock),
  alerts: structuredClone(alertsMock),
  tasks: structuredClone(tasksMock),
  spaceWeather: structuredClone(spaceWeatherMock),
  issPosition: structuredClone(issPositionMock),
  cabin: structuredClone(cabinMock),
  opsMessages: structuredClone(opsMessagesMock),
  scenarios: structuredClone(scenariosMock)
};

export function withClientMeta(body = {}, isUpdate = false) {
  const now = new Date().toISOString();
  return {
    clientId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cid-${Date.now()}-${Math.random()}`,
    [isUpdate ? 'clientUpdatedAt' : 'clientCreatedAt']: now,
    ...body
  };
}

function isQueueableMutation(method, cleanPath) {
  if (method === 'PATCH') {
    return /^\/(alerts|tasks)\/\d+$/.test(cleanPath);
  }
  if (method === 'POST') {
    if (cleanPath === '/ops/messages') return true;
    return /^\/crew\/C00[1-4]\/(vitals|cognitive|wellbeing|symptoms|nutrition|medications)$/.test(cleanPath);
  }
  return false;
}

function classifyVitalLevel(metric, value) {
  const num = Number(value);
  if (Number.isNaN(num)) return 'unknown';
  if (metric === 'heartRate') return num > 130 || num < 50 ? 'critical' : num > 100 || num < 60 ? 'warning' : 'ok';
  if (metric === 'spo2') return num < 90 ? 'critical' : num < 94 ? 'warning' : num < 95 ? 'watch' : 'ok';
  if (metric === 'systolicBp') return num >= 160 || num < 90 ? 'critical' : num >= 140 ? 'warning' : num >= 129 ? 'watch' : 'ok';
  if (metric === 'bodyTemp') return num >= 38.5 ? 'critical' : num >= 37.8 ? 'warning' : num >= 37.2 ? 'watch' : 'ok';
  return 'ok';
}

function handleMockRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const [cleanPath, queryString] = path.split('?');
  const params = new URLSearchParams(queryString || '');
  const body = options.body ? JSON.parse(options.body) : {};

  // GET endpoints
  if (method === 'GET') {
    if (cleanPath === '/mission/status') return structuredClone(mockStore.mission);
    if (cleanPath === '/crew') return structuredClone(mockStore.crew);
    if (cleanPath === '/scenarios') return structuredClone(mockStore.scenarios);
    if (cleanPath === '/environment/space-weather') return structuredClone(mockStore.spaceWeather);
    if (cleanPath === '/environment/iss-position') return structuredClone(mockStore.issPosition);
    if (cleanPath === '/environment/cabin') return structuredClone(mockStore.cabin);

    if (cleanPath === '/alerts') {
      const crewId = params.get('crewId');
      const statusFilter = params.get('status');
      let list = structuredClone(mockStore.alerts.data);
      if (crewId) list = list.filter((a) => a.crewId === null || a.crewId === crewId);
      if (statusFilter === 'open') list = list.filter((a) => a.status !== 'resolved');
      else if (statusFilter) list = list.filter((a) => a.status === statusFilter);
      return {
        status: 'success',
        data: list,
        meta: { total: list.length, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false }
      };
    }

    if (cleanPath === '/ops/messages') {
      const kind = params.get('kind');
      let list = structuredClone(mockStore.opsMessages.data);
      if (kind) list = list.filter((m) => m.kind === kind);
      return {
        status: 'success',
        data: list,
        meta: { total: list.length, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false }
      };
    }

    const crewMatch = cleanPath.match(/^\/crew\/(C00[1-4])\/(.+)$/);
    if (crewMatch) {
      const [, crewId, sub] = crewMatch;
      if (sub === 'overview') return structuredClone(mockStore.overview[crewId] || mockStore.overview.C004);
      if (sub === 'vitals') {
        const metric = params.get('metric') || 'heartRate';
        return structuredClone(mockStore.vitals[metric] || mockStore.vitals.heartRate);
      }
      if (sub === 'health-scores') return structuredClone(healthScoresMock);
      if (sub === 'sleep') return structuredClone(mockStore.sleep);
      if (sub === 'cognitive') return structuredClone(mockStore.cognitive);
      if (sub === 'nutrition') return structuredClone(mockStore.nutrition);
      if (sub === 'wellbeing') return structuredClone(mockStore.wellbeing);
      if (sub === 'symptoms') return structuredClone(mockStore.symptoms);
      if (sub === 'medical') return structuredClone(mockStore.medical[crewId] || mockStore.medical.C002);
      if (sub === 'labs') {
        const phase = params.get('phase');
        let list = structuredClone(mockStore.labs.data);
        if (phase) list = list.filter((l) => l.phase === phase);
        return { status: 'success', data: list, meta: { source: 'simulated' } };
      }
      if (sub === 'twin') return structuredClone(mockStore.twin);
      if (sub === 'countermeasures') return structuredClone(mockStore.countermeasures);
      if (sub === 'correlations') return structuredClone(mockStore.correlations);
      if (sub === 'tasks') {
        const status = params.get('status');
        let list = structuredClone(mockStore.tasks[crewId] || []);
        if (status) list = list.filter((t) => t.status === status);
        return {
          status: 'success',
          data: list,
          meta: { total: list.length, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false }
        };
      }
    }
  }

  // POST /scenarios/:code/start y /scenarios/stop
  if (method === 'POST' && cleanPath === '/scenarios/stop') {
    mockStore.mission.data.scenario = null;
    mockStore.mission.data.commDelaySec = 0;
    mockStore.alerts.data = mockStore.alerts.data.map((a) =>
      a.status === 'pending_ground' ? { ...a, status: 'active' } : a
    );
    return { status: 'success', data: { state: 'stopped' } };
  }

  const scStartMatch = cleanPath.match(/^\/scenarios\/([a-z_]+)\/start$/);
  if (method === 'POST' && scStartMatch) {
    const code = scStartMatch[1];
    const found = mockStore.scenarios.data.find((s) => s.code === code);
    if (!found) throw new Error(`Escenario desconocido: ${code}`);
    const startedAt = new Date().toISOString();
    mockStore.mission.data.scenario = { code: found.code, name: found.name, startedAt };
    mockStore.mission.data.commDelaySec = found.commDelaySec;

    if (code === 'mars_delay') {
      mockStore.alerts.data = mockStore.alerts.data.map((a) =>
        a.id === 41 ? { ...a, status: 'pending_ground', groundDeadlineAt: '2026-11-14T10:52:00Z' } : a
      );
    } else if (code === 'eclss_failure') {
      mockStore.cabin.data = mockStore.cabin.data.map((c) =>
        c.metric === 'co2' ? { ...c, value: 6.4, level: 'warning', recordedAt: startedAt } : c
      );
      if (!mockStore.alerts.data.some((a) => a.id === 99)) {
        mockStore.alerts.data.unshift({
          id: 99, crewId: null, category: 'cabin', level: 'critical',
          title: 'Fallo depurador CO₂ (CDRA)', message: 'CO₂ de cabina en 6,4 mmHg y subiendo.',
          source: 'ECLSS', status: 'active', createdAt: startedAt, updatedAt: startedAt,
          ackedAt: null, resolvedAt: null, groundDeadlineAt: null, actions: []
        });
      }
    } else if (code === 'solar_storm') {
      mockStore.mission.data.spaceWeather = { kp: 7.4, protonFluxPfu: 480, level: 'critical' };
      mockStore.spaceWeather.data.kp = 7.4;
      mockStore.spaceWeather.data.protonFluxPfu = 480;
    }

    return {
      status: 'success',
      data: { code: found.code, state: 'started', startedAt, commDelaySec: found.commDelaySec }
    };
  }

  // PATCH /alerts/:id
  const alertPatchMatch = cleanPath.match(/^\/alerts\/(\d+)$/);
  if (method === 'PATCH' && alertPatchMatch) {
    const id = Number(alertPatchMatch[1]);
    const idx = mockStore.alerts.data.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('Alerta no encontrada');
    const current = mockStore.alerts.data[idx];
    if (current.status === 'pending_ground' && body.status === 'resolved') {
      throw new Error('Conflict: no se puede resolver hasta recibir decisión de Tierra o protocolo autónomo');
    }
    const updated = {
      ...current,
      status: body.status,
      updatedAt: new Date().toISOString(),
      ackedAt: body.status === 'ack' ? new Date().toISOString() : current.ackedAt,
      resolvedAt: body.status === 'resolved' ? new Date().toISOString() : current.resolvedAt
    };
    mockStore.alerts.data[idx] = updated;
    return { status: 'success', data: structuredClone(updated) };
  }

  // PATCH /tasks/:id
  const taskPatchMatch = cleanPath.match(/^\/tasks\/(\d+)$/);
  if (method === 'PATCH' && taskPatchMatch) {
    const id = Number(taskPatchMatch[1]);
    for (const cId of Object.keys(mockStore.tasks)) {
      const idx = mockStore.tasks[cId].findIndex((t) => t.id === id);
      if (idx !== -1) {
        const task = mockStore.tasks[cId][idx];
        const updated = { ...task, status: body.status || 'done', result: body.result || {}, updatedAt: new Date().toISOString() };
        mockStore.tasks[cId][idx] = updated;
        if (task.type === 'measurement' && task.expects && body.result?.value != null) {
          const level = classifyVitalLevel(task.expects.metric, body.result.value);
          const entry = {
            metric: task.expects.metric,
            value: Number(body.result.value),
            unit: task.expects.unit,
            level,
            source: 'manual',
            recordedAt: new Date().toISOString()
          };
          if (mockStore.overview[cId]) {
            const vIdx = mockStore.overview[cId].data.vitals.findIndex((v) => v.metric === entry.metric);
            if (vIdx >= 0) mockStore.overview[cId].data.vitals[vIdx] = entry;
            else mockStore.overview[cId].data.vitals.push(entry);
          }
        }
        return { status: 'success', data: structuredClone(updated) };
      }
    }
    throw new Error('Tarea no encontrada');
  }

  // POST /crew/:id/vitals
  const vitalPostMatch = cleanPath.match(/^\/crew\/(C00[1-4])\/vitals$/);
  if (method === 'POST' && vitalPostMatch) {
    const crewId = vitalPostMatch[1];
    const level = classifyVitalLevel(body.metric, body.value);
    const created = {
      metric: body.metric,
      value: Number(body.value),
      unit: body.unit,
      level,
      source: 'manual',
      recordedAt: body.clientCreatedAt || new Date().toISOString()
    };
    if (mockStore.overview[crewId]) {
      const idx = mockStore.overview[crewId].data.vitals.findIndex((v) => v.metric === created.metric);
      if (idx >= 0) mockStore.overview[crewId].data.vitals[idx] = created;
      else mockStore.overview[crewId].data.vitals.push(created);
    }
    if (mockStore.vitals[created.metric]) {
      mockStore.vitals[created.metric].data.points.push({
        t: created.recordedAt,
        value: created.value,
        min: created.value,
        max: created.value
      });
    }
    return { status: 'success', data: created };
  }

  // POST /crew/:id/cognitive
  const cogPostMatch = cleanPath.match(/^\/crew\/(C00[1-4])\/cognitive$/);
  if (method === 'POST' && cogPostMatch) {
    const ms = Number(body.meanReactionMs);
    const created = {
      id: Date.now(),
      recordedAt: body.clientCreatedAt || new Date().toISOString(),
      meanReactionMs: ms,
      lapses: Number(body.lapses || 0),
      baselineMs: 240,
      level: ms > 350 ? 'warning' : ms > 270 ? 'watch' : 'ok'
    };
    mockStore.cognitive.data.push(created);
    return { status: 'success', data: created };
  }

  // POST /crew/:id/wellbeing
  const wellPostMatch = cleanPath.match(/^\/crew\/(C00[1-4])\/wellbeing$/);
  if (method === 'POST' && wellPostMatch) {
    const created = {
      id: Date.now(),
      recordedAt: body.clientCreatedAt || new Date().toISOString(),
      mood: Number(body.mood),
      isolation: Number(body.isolation),
      cohabitation: Number(body.cohabitation),
      note: body.note || ''
    };
    mockStore.wellbeing.data.unshift(created);
    return { status: 'success', data: created };
  }

  // POST /crew/:id/symptoms
  const symPostMatch = cleanPath.match(/^\/crew\/(C00[1-4])\/symptoms$/);
  if (method === 'POST' && symPostMatch) {
    const created = {
      id: Date.now(),
      symptom: body.symptom,
      severity: Number(body.severity),
      recordedAt: body.clientCreatedAt || new Date().toISOString(),
      note: body.note || ''
    };
    mockStore.symptoms.data.unshift(created);
    return { status: 'success', data: created };
  }

  // POST /crew/:id/twin/simulate
  const twinSimMatch = cleanPath.match(/^\/crew\/(C00[1-4])\/twin\/simulate$/);
  if (method === 'POST' && twinSimMatch) {
    const ex = Number(body.exerciseMinPerDay ?? 90);
    const load = Number(body.resistanceLoadPct ?? 60);
    const factor = Math.max(0.35, 1.85 - (ex / 90) * 0.5 - (load / 60) * 0.35);
    const points = [0, 30, 60, 90, 120, 150, 180].map((day) => ({
      day,
      boneDensityLossPct: Number(((day / 180) * 5.5 * factor).toFixed(1)),
      muscleMassLossPct: Number(((day / 180) * 7.6 * factor).toFixed(1))
    }));
    const result = {
      status: 'success',
      data: { assumptions: { exerciseMinPerDay: ex, resistanceLoadPct: load }, points },
      meta: { source: 'simulated' }
    };
    mockStore.twin = structuredClone(result);
    return result;
  }

  // POST /ops/messages
  if (method === 'POST' && cleanPath === '/ops/messages') {
    const delaySec = mockStore.mission.data.commDelaySec || 0;
    const createdAt = body.clientCreatedAt || new Date().toISOString();
    const deliverAt = new Date(new Date(createdAt).getTime() + delaySec * 1000).toISOString();
    const msg = {
      id: mockStore.opsMessages.data.length + 1,
      kind: 'message',
      direction: 'crew_to_ground',
      crewId: body.crewId || 'C002',
      alertId: body.alertId || null,
      body: body.body,
      createdAt,
      deliverAt,
      delivered: delaySec === 0
    };
    mockStore.opsMessages.data.push(msg);
    return { status: 'success', data: msg };
  }

  throw new Error(`Endpoint mock no implementado: ${method} ${path}`);
}

export async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const [cleanPath] = path.split('?');

  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 60));
    return handleMockRequest(path, options);
  }

  // GET con caché en IndexedDB (timeout 2s según contrato)
  if (method === 'GET') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        signal: controller.signal,
        ...options
      });
      clearTimeout(timeoutId);
      const json = await res.json();
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || json.error || `HTTP ${res.status}`);
      }
      await saveGetCache(path, json);
      return json;
    } catch (err) {
      clearTimeout(timeoutId);
      const cached = await readGetCache(path);
      if (cached?.payload) {
        const ageMin = Math.max(1, Math.round((Date.now() - cached.savedAt) / 60000));
        return {
          ...cached.payload,
          meta: {
            ...(cached.payload.meta || {}),
            fromOfflineCache: true,
            offlineAgeMin: ageMin
          }
        };
      }
      throw err;
    }
  }

  // POST / PATCH con encolado offline para operaciones permitidas
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const json = await res.json();
    if (!res.ok || json.status !== 'success') {
      throw new Error(json.message || json.error || `HTTP ${res.status}`);
    }
    return json;
  } catch (err) {
    if (isQueueableMutation(method, cleanPath) && typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueueMutation({ path, method, body: options.body });
      return {
        status: 'success',
        data: options.body ? JSON.parse(options.body) : {},
        meta: { queuedOffline: true }
      };
    }
    throw err;
  }
}

export async function flushOfflineQueue() {
  if (USE_MOCKS) return;
  const items = await getQueuedMutations();
  for (const item of items) {
    try {
      const res = await fetch(`${API_URL}${item.path}`, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.body
      });
      if (res.ok || res.status === 400 || res.status === 409) {
        await deleteQueuedMutation(item.id);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}

export async function streamCopilotChat({ crewId, messages, signal, onContext, onToken, onDone, onError }) {
  if (USE_MOCKS) {
    const ov = mockStore.overview[crewId]?.data || mockStore.overview.C004.data;
    const hr = ov.vitals.find((v) => v.metric === 'heartRate');
    const spo2 = ov.vitals.find((v) => v.metric === 'spo2');
    const co2 = mockStore.cabin.data.find((c) => c.metric === 'co2');
    const activeAlerts = mockStore.alerts.data.filter((a) => a.status !== 'resolved');

    const ctxSummary = [
      hr ? `FC ${hr.value} ${hr.unit}` : 'Sin telemetría cardiaca',
      spo2 ? `SpO2 ${spo2.value}%` : null,
      co2 ? `CO₂ de cabina ${co2.value} ${co2.unit}` : null,
      activeAlerts.length ? `${activeAlerts.length} alerta(s) activa(s)` : 'sin alertas críticas'
    ].filter(Boolean).join(', ');

    await new Promise((r) => setTimeout(r, 150));
    if (signal?.aborted) return;
    onContext?.({ summary: ctxSummary, vitals: ov.vitals, alerts: activeAlerts });

    const lastUserMsg = messages[messages.length - 1]?.content || '';
    const reply = crewId === 'C004'
      ? `No dispongo de constantes biomédicas recientes para Darío Costa (estado Sin datos). Recomiendo registrar tensión arterial y SpO2 manuales en la pestaña Constantes antes de valorar "${lastUserMsg}".`
      : `He evaluado tu consulta ("${lastUserMsg}") junto con tus constantes actuales (${ctxSummary}). Con el flujo de protones S2 activo y CO₂ en ${co2?.value ?? 4.1} mmHg, permanece en el módulo blindado, hidrátate y completa tu medición de tensión arterial pendiente.`;

    const words = reply.split(' ');
    for (let i = 0; i < words.length; i++) {
      if (signal?.aborted) return;
      await new Promise((r) => setTimeout(r, 35));
      onToken?.((i === 0 ? '' : ' ') + words[i]);
    }
    onDone?.({ answer: reply, model: 'ollama/llama3-medical-mock', triageLevel: ov.healthScore.level || 'watch' });
    return;
  }

  const res = await fetch(`${API_URL}/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      crewId,
      clientId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `chat-${Date.now()}`,
      messages
    })
  });

  if (!res.ok) {
    let msg = `Error del agente (${res.status})`;
    try {
      const errJson = await res.json();
      msg = errJson.message || errJson.error || msg;
    } catch {}
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      const eventMatch = block.match(/^event:\s*(.+)$/m);
      const dataMatch = block.match(/^data:\s*(.+)$/m);
      if (!eventMatch || !dataMatch) continue;

      const event = eventMatch[1].trim();
      const payload = JSON.parse(dataMatch[1]);

      if (event === 'context') {
        const vStr = (payload.vitals || []).map((v) => `${v.metric} ${v.value} ${v.unit}`).join(', ');
        onContext?.({ ...payload, summary: vStr || 'Contexto de misión cargado' });
      } else if (event === 'token') {
        onToken?.(payload.text || '');
      } else if (event === 'done') {
        onDone?.(payload);
      } else if (event === 'error') {
        onError?.(payload.error || 'Error durante la respuesta en streaming');
      }
    }
  }
}

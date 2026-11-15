import type { Alert, AlertActionsResponse, ChiefMessage, RecommendedAction } from '@chief/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api/client';
import type { CapsuleState } from '../components/Capsule.vue';
import { firstName } from '../lib/format';
import { useMissionStore } from './mission';
import { useUiStore } from './ui';

export interface ChatMessage extends ChiefMessage {
  actions?: RecommendedAction[];
  /** The answer came from the rules engine fallback, not from Gemini. */
  fallback?: boolean;
  /** One line on what the answer is based on. */
  basis?: string;
}

type ActionsState =
  | { state: 'loading' }
  | { state: 'ready'; data: AlertActionsResponse }
  | { state: 'error'; message: string };

/** Minimal typing of the browser's Web Speech API (not in the DOM lib). */
interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

const now = () => new Date().toISOString();
let seq = 0;
const msg = (role: ChatMessage['role'], text: string, extra: Partial<ChatMessage> = {}) => ({
  id: `m${++seq}`,
  role,
  text,
  createdAt: now(),
  ...extra,
});

/** CHIEF chat, alert recommendations and push-to-talk. Always through the backend. */
export const useChiefStore = defineStore('chief', () => {
  const mission = useMissionStore();
  const ui = useUiStore();

  /** One conversation per crew member. */
  const threads = ref<Record<string, ChatMessage[]>>({});
  const thinking = ref(false);
  /** False once the backend answered in fallback mode (agent or Gemini down). */
  const online = ref(true);
  const recording = ref(false);
  const recordStart = ref(0);
  const voiceError = ref<string | null>(null);
  const actions = ref<Record<string, ActionsState>>({});

  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let recognition: Recognition | null = null;
  let spokenText = '';

  const messages = computed(() => threads.value[mission.selected] ?? []);

  /**
   * The mascot's state, the same on the Talk to CHIEF button and in the chat: sky blue,
   * grey only when CHIEF is offline. Pending alerts are told by the button's text, not by
   * turning the mascot amber, so amber keeps meaning a health status.
   */
  const mascot = computed<CapsuleState>(() =>
    recording.value ? 'listening' : thinking.value ? 'thinking' : online.value ? 'idle' : 'offline',
  );

  function thread(crewId: string): ChatMessage[] {
    if (!threads.value[crewId]) {
      const name = firstName(mission.memberName(crewId));
      threads.value[crewId] = [
        msg(
          'chief',
          `Hi ${name}. I explain your readings and suggest actions. I don’t replace the Crew Medical Officer or the flight surgeon.`,
        ),
      ];
    }
    return threads.value[crewId] as ChatMessage[];
  }

  function openChat() {
    thread(mission.selected);
    ui.chatOpen = true;
  }

  async function ask(text: string, opts: { speak?: boolean } = {}) {
    const crewId = mission.selected;
    const list = thread(crewId);
    const history: ChiefMessage[] = list
      .slice(-20)
      .map(({ id, role, text: t, createdAt }) => ({ id, role, text: t, createdAt }));
    list.push(msg('crew', text));
    ui.chatOpen = true;
    thinking.value = true;
    try {
      const res = await api.chat({ crewMemberId: crewId, message: text, history });
      online.value = !res.fallback;
      list.push({ ...res.reply, actions: res.actions, fallback: res.fallback });
      if (opts.speak) void speak(res.reply.text);
    } catch (error) {
      online.value = false;
      list.push(msg('chief', `I could not reach the ship's system: ${(error as Error).message}.`));
    } finally {
      thinking.value = false;
    }
  }

  /** Recommended actions for one alert, shown inline in the alerts panel. */
  async function loadActions(alert: Alert, force = false) {
    if (!force && actions.value[alert.id]?.state === 'ready') return;
    actions.value[alert.id] = { state: 'loading' };
    try {
      const data = await api.alertActions(alert.id);
      online.value = !data.fallback;
      actions.value[alert.id] = { state: 'ready', data };
    } catch (error) {
      actions.value[alert.id] = { state: 'error', message: (error as Error).message };
    }
  }

  /** "Ask CHIEF" on an alert: the question and its answer go to the chat. */
  async function askAboutAlert(alert: Alert) {
    mission.selected = alert.crewMemberId;
    const list = thread(alert.crewMemberId);
    list.push(msg('crew', `What should I do about “${alert.title}”?`));
    ui.chatOpen = true;
    thinking.value = true;
    try {
      const data = await api.alertActions(alert.id);
      online.value = !data.fallback;
      actions.value[alert.id] = { state: 'ready', data };
      list.push(
        msg('chief', data.summary, {
          actions: data.actions,
          fallback: data.fallback,
          basis: `Based on the ${alert.title.toLowerCase()} alert, ${alert.createdAt.slice(0, 16).replace('T', ' ')} UTC (mission time).`,
        }),
      );
    } catch (error) {
      list.push(msg('chief', `I could not prepare actions: ${(error as Error).message}.`));
    } finally {
      thinking.value = false;
    }
  }

  async function speak(text: string) {
    try {
      const audio = new Audio(URL.createObjectURL(await api.tts(text)));
      await audio.play();
    } catch {
      if ('speechSynthesis' in window)
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  }

  /** Push-to-talk: record while the button is held. Web Speech runs alongside as fallback. */
  async function startRecording() {
    if (recording.value) return;
    voiceError.value = null;
    spokenText = '';
    const Ctor = ((window as unknown as Record<string, unknown>).SpeechRecognition ??
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as
      RecognitionCtor | undefined;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.start();
    } catch {
      recorder = null;
      if (!Ctor) {
        voiceError.value = 'Microphone unavailable.';
        return;
      }
    }
    if (Ctor) {
      try {
        recognition = new Ctor();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.onresult = (e) => {
          spokenText = Array.from(e.results)
            .map((r) => r[0]?.transcript ?? '')
            .join(' ');
        };
        recognition.start();
      } catch {
        recognition = null;
      }
    }
    recording.value = true;
    recordStart.value = Date.now();
  }

  async function stopRecording(send = true) {
    if (!recording.value) return;
    recording.value = false;
    recognition?.stop();
    const rec = recorder;
    recorder = null;
    const blob = rec
      ? await new Promise<Blob>((resolve) => {
          rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
          rec.stop();
          rec.stream.getTracks().forEach((t) => t.stop());
        })
      : null;
    if (!send) return;
    let text = '';
    if (blob && blob.size > 0) {
      try {
        text = (await api.stt(blob)).trim();
      } catch {
        text = '';
      }
    }
    // Voice service down: wait briefly for the browser's own recognition result.
    if (!text) {
      await new Promise((r) => setTimeout(r, 400));
      text = spokenText.trim();
    }
    if (text) await ask(text, { speak: true });
    else voiceError.value = 'Nothing was heard. Hold the microphone and speak.';
  }

  return {
    messages,
    thinking,
    online,
    recording,
    mascot,
    recordStart,
    voiceError,
    actions,
    openChat,
    ask,
    loadActions,
    askAboutAlert,
    startRecording,
    stopRecording,
  };
});

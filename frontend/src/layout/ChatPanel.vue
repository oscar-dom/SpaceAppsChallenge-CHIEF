<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import ActionList from '../components/ActionList.vue';
import Capsule from '../components/Capsule.vue';
import Icon from '../components/Icon.vue';
import StatusChip from '../components/StatusChip.vue';
import { firstName } from '../lib/format';
import { CHAT_W } from '../lib/shell';
import { useChiefStore } from '../stores/chief';
import { useMissionStore } from '../stores/mission';
import { useUiStore } from '../stores/ui';

/** CHIEF chat: text and push-to-talk, with the rules engine fallback when CHIEF is offline. */
const mission = useMissionStore();
const chief = useChiefStore();
const ui = useUiStore();

const input = ref('');
const scroller = ref<HTMLDivElement | null>(null);
const recTime = ref('0:00.0');
let timer: ReturnType<typeof setInterval> | undefined;

const PROMPTS = ['Why is my score lower today?', 'What should I eat?', 'Can I exercise today?'];
const BARS = Array.from({ length: 28 }, (_, i) => ({
  d: `${0.6 + ((i * 37) % 7) / 10}s`,
  delay: `${-((i * 53) % 10) / 10}s`,
}));

const statusText = computed(() =>
  chief.recording
    ? 'Listening…'
    : chief.thinking
      ? 'Thinking…'
      : chief.online
        ? 'Online · answers are short and cite their data'
        : 'Offline · rules engine still running',
);

/** Standard advice from the thresholds table for the member's active alerts. */
const standard = computed(() =>
  (mission.alerts[mission.selected] ?? []).filter((a) => a.kind === 'anomaly' && a.recommendation),
);

watch(
  () => [chief.messages.length, chief.thinking],
  async () => {
    await nextTick();
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
  },
);

watch(
  () => chief.recording,
  (on) => {
    clearInterval(timer);
    if (!on) return;
    timer = setInterval(() => {
      const s = (Date.now() - chief.recordStart) / 1000;
      recTime.value = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
    }, 100);
  },
);
onBeforeUnmount(() => clearInterval(timer));

function send(text = input.value) {
  const t = text.trim();
  if (!t || chief.thinking) return;
  input.value = '';
  void chief.ask(t);
}
const chatW = `${CHAT_W}px`;
</script>

<template>
  <aside class="chat assistant-surface">
    <div class="head">
      <Capsule :state="chief.mascot" :size="36" />
      <div class="who">
        <span class="name">CHIEF</span>
        <span class="muted small ellipsis">{{ statusText }}</span>
      </div>
      <span class="context">Context: {{ mission.member?.name }}</span>
      <button class="icon-btn" title="Close chat" @click="ui.chatOpen = false">
        <Icon name="close" />
      </button>
    </div>

    <div v-if="!chief.online" class="offline">
      <Icon name="offline" :size="18" />
      <div>
        <div class="strong">CHIEF is offline: showing standard recommendations</div>
        <div class="small">Statuses and alerts keep working. Answers use the thresholds table.</div>
      </div>
    </div>

    <div ref="scroller" class="messages">
      <template v-for="m in chief.messages" :key="m.id">
        <div v-if="m.role === 'crew'" class="user">{{ m.text }}</div>
        <div v-else class="chief">
          <Capsule :state="m.fallback ? 'offline' : 'idle'" :size="26" />
          <div class="bubble">
            <span class="text">{{ m.text }}</span>
            <ActionList v-if="m.actions?.length" :actions="m.actions" />
            <span v-if="m.fallback" class="faint small"
              >Standard recommendation · CHIEF offline</span
            >
            <span v-else-if="m.basis" class="faint small">{{ m.basis }}</span>
          </div>
        </div>
      </template>
      <div v-if="chief.thinking" class="thinking">
        <Capsule state="thinking" :size="26" />CHIEF is thinking
        <span class="dots"><span /><span /><span /></span>
      </div>
      <template v-if="!chief.online && standard.length">
        <span class="label small-label">Standard recommendations · {{ mission.member?.name }}</span>
        <div v-for="a in standard" :key="a.id" class="card std">
          <div
            class="bar"
            :style="{ background: `var(--${a.severity === 'info' ? 'info' : a.severity})` }"
          />
          <div class="std-head">
            <span class="strong">{{ a.title }}</span><StatusChip :status="a.severity" plain />
          </div>
          <p class="small std-text">{{ a.recommendation }}</p>
        </div>
      </template>
    </div>

    <div class="prompts">
      <button
        v-for="p in PROMPTS"
        :key="p"
        class="prompt"
        :disabled="chief.thinking"
        @click="send(p)"
      >
        {{ p }}
      </button>
    </div>

    <div class="composer">
      <button
        class="mic"
        :class="{ on: chief.recording }"
        title="Hold to talk"
        @pointerdown.prevent="chief.startRecording()"
        @pointerup="chief.stopRecording()"
        @pointerleave="chief.recording && chief.stopRecording(false)"
      >
        <Icon name="mic" :size="18" />
      </button>
      <div v-if="chief.recording" class="recording">
        <span class="listening">LISTENING</span>
        <div class="wave">
          <span
            v-for="(b, i) in BARS"
            :key="i"
            :style="{ animation: `chWave ${b.d} ease-in-out ${b.delay} infinite` }"
          />
        </div>
        <span class="mono small muted">{{ recTime }}</span>
      </div>
      <template v-else>
        <input
          v-model="input"
          class="field"
          :placeholder="`Ask CHIEF about ${firstName(mission.member?.name ?? 'your')}’s health…`"
          @keydown.enter="send()"
        />
        <button
          class="send"
          title="Send"
          :disabled="!input.trim() || chief.thinking"
          @click="send()"
        >
          <Icon name="send" :size="17" :stroke="1.6" />
        </button>
      </template>
    </div>
    <div class="hint">
      {{
        chief.voiceError ??
        'Hold the microphone to talk, release to send. CHIEF only suggests onboard-kit medication.'
      }}
    </div>
  </aside>
</template>

<style scoped>
.chat {
  width: v-bind(chatW);
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-left: 1px solid var(--border);
  animation: chPanel 180ms ease;
  min-height: 0;
}
.head {
  height: 56px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px 0 16px;
  border-bottom: 1px solid var(--border);
  /* A deeper band names the region: this is CHIEF talking. */
  background: var(--panel-3);
}
.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.name {
  font-size: 14px;
  font-weight: 600;
}
.small {
  font-size: 12px;
}
.strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}
.context {
  font-size: 11px;
  color: var(--text-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  padding: 2px 8px;
  white-space: nowrap;
}
.offline {
  flex: none;
  display: flex;
  gap: 10px;
  padding: 10px 16px;
  background: var(--panel-2);
  border-bottom: 1px solid var(--border);
  color: var(--text-2);
}
.messages {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.user {
  align-self: flex-end;
  max-width: 82%;
  background: var(--accent-tint);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: 10px 10px 2px 10px;
  padding: 8px 12px;
  animation: chOpen 160ms ease;
}
.chief {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  animation: chOpen 180ms ease;
}
.bubble {
  flex: 1;
  min-width: 0;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 2px 10px 10px 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.text {
  line-height: 1.5;
  white-space: pre-line;
}
.thinking {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: 12px;
}
.dots {
  display: inline-flex;
  gap: 3px;
}
.dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-2);
  animation: chDots 1s infinite;
}
.dots span:nth-child(2) {
  animation-delay: 0.2s;
}
.dots span:nth-child(3) {
  animation-delay: 0.4s;
}
.small-label {
  font-size: 11px;
}
.std {
  background: var(--panel-2);
  padding: 10px 12px 8px 15px;
}
.std-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
.std-text {
  margin: 4px 0 0;
  line-height: 1.45;
}
.prompts {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px 10px;
}
.prompt {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-2);
  border-radius: 14px;
  /* Filled like the cards, so the suggestions read as buttons on the blue panel. */
  background: var(--panel-2);
  font-size: 12px;
  white-space: nowrap;
}
.prompt:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.composer {
  flex: none;
  padding: 12px 16px 8px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
  align-items: center;
}
.mic {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 50%;
  border: 1px solid var(--border-2);
  background: var(--panel-2);
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}
.mic:hover {
  border-color: var(--accent);
}
.mic.on {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}
.recording {
  flex: 1;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--panel-2);
}
.listening {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--accent);
}
.wave {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 22px;
}
.wave span {
  flex: 1;
  height: 100%;
  background: var(--accent);
  border-radius: 1px;
}
.field {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border-2);
  border-radius: 6px;
  background: var(--panel-2);
  outline: none;
}
.field:focus {
  border-color: var(--accent);
}
.send {
  width: 40px;
  height: 40px;
  flex: none;
  border: 0;
  border-radius: 6px;
  background: var(--accent);
  color: var(--on-accent);
  display: flex;
  align-items: center;
  justify-content: center;
}
.hint {
  flex: none;
  padding: 0 16px 10px;
  font-size: 11px;
  color: var(--text-3);
}
</style>

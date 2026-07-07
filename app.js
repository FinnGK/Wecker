'use strict';

const STORAGE_KEY = 'finns-wecker.alarms.v1';
const PREF_KEY = 'finns-wecker.preferences.v1';
const CHECK_INTERVAL_MS = 500;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  alarms: [],
  activeAlarm: null,
  audio: null,
  wakeLock: null,
};

const elements = {
  clock: $('#clock'),
  today: $('#today'),
  form: $('#alarmForm'),
  hourInput: $('#hourInput'),
  minuteInput: $('#minuteInput'),
  dateInput: $('#dateInput'),
  dateField: $('#dateField'),
  labelInput: $('#labelInput'),
  volumeInput: $('#volumeInput'),
  vibrateInput: $('#vibrateInput'),
  list: $('#alarmsList'),
  empty: $('#emptyState'),
  status: $('#status'),
  template: $('#alarmTemplate'),
  overlay: $('#alarmOverlay'),
  ringTime: $('#ringTime'),
  ringLabel: $('#ringLabel'),
  stopBtn: $('#stopBtn'),
  snooze5Btn: $('#snooze5Btn'),
  snooze10Btn: $('#snooze10Btn'),
  notifyBtn: $('#notifyBtn'),
  wakeLockBtn: $('#wakeLockBtn'),
  clearDoneBtn: $('#clearDoneBtn'),
  testSoundBtn: $('#testSoundBtn'),
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseLocalDateTime(dateText, hour, minute) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `alarm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeHourMinute() {
  let hour = Number(elements.hourInput.value);
  let minute = Number(elements.minuteInput.value);
  if (!Number.isFinite(hour)) hour = 0;
  if (!Number.isFinite(minute)) minute = 0;
  hour = Math.max(0, Math.min(23, Math.trunc(hour)));
  minute = Math.max(0, Math.min(59, Math.trunc(minute)));
  elements.hourInput.value = pad2(hour);
  elements.minuteInput.value = pad2(minute);
  return { hour, minute };
}

function selectedType() {
  const selected = document.querySelector('input[name="alarmType"]:checked');
  return selected ? selected.value : 'once';
}

function loadAlarms() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.alarms = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(state.alarms)) state.alarms = [];
  } catch (_error) {
    state.alarms = [];
    setStatus('Gespeicherte Alarme konnten nicht gelesen werden. Speicher wurde neu gestartet.');
  }
}

function saveAlarms() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.alarms));
}

function loadPreferences() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if (typeof prefs.volume === 'number') elements.volumeInput.value = String(prefs.volume);
    if (typeof prefs.vibrate === 'boolean') elements.vibrateInput.checked = prefs.vibrate;
  } catch (_error) {
    // Ignore invalid preferences.
  }
}

function savePreferences() {
  localStorage.setItem(PREF_KEY, JSON.stringify({
    volume: Number(elements.volumeInput.value),
    vibrate: elements.vibrateInput.checked,
  }));
}

function setStatus(message) {
  elements.status.textContent = message;
}

function getWeekdayMondayFirst(date) {
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function nextTriggerForAlarm(alarm, now = new Date()) {
  if (!alarm.enabled) return null;

  if (alarm.type === 'once') {
    if (!alarm.triggerAt) return null;
    const trigger = new Date(alarm.triggerAt);
    return Number.isNaN(trigger.getTime()) ? null : trigger;
  }

  for (let offset = 0; offset <= 8; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(alarm.hour, alarm.minute, 0, 0);

    if (candidate <= now) continue;

    if (alarm.type === 'daily') return candidate;
    if (alarm.type === 'weekdays') {
      const day = getWeekdayMondayFirst(candidate);
      if (day >= 1 && day <= 5) return candidate;
    }
  }

  return null;
}

function formatAlarmTime(alarm) {
  return `${pad2(alarm.hour)}:${pad2(alarm.minute)}`;
}

function formatDateLong(date) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatNextTrigger(trigger) {
  if (!trigger) return 'Keine nächste Auslösung';
  const now = new Date();
  const today = toDateInputValue(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = toDateInputValue(tomorrowDate);
  const triggerDay = toDateInputValue(trigger);
  const time = `${pad2(trigger.getHours())}:${pad2(trigger.getMinutes())}`;

  if (triggerDay === today) return `Heute um ${time}`;
  if (triggerDay === tomorrow) return `Morgen um ${time}`;
  return `${new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(trigger)} um ${time}`;
}

function typeLabel(type) {
  if (type === 'daily') return 'Täglich';
  if (type === 'weekdays') return 'Mo–Fr';
  return 'Einmalig';
}

function renderAlarms() {
  const now = new Date();
  state.alarms.sort((a, b) => {
    const nextA = nextTriggerForAlarm(a, now);
    const nextB = nextTriggerForAlarm(b, now);
    const timeA = nextA ? nextA.getTime() : Number.MAX_SAFE_INTEGER;
    const timeB = nextB ? nextB.getTime() : Number.MAX_SAFE_INTEGER;
    return timeA - timeB;
  });

  elements.list.innerHTML = '';
  elements.empty.classList.toggle('visible', state.alarms.length === 0);

  state.alarms.forEach((alarm) => {
    const fragment = elements.template.content.cloneNode(true);
    const card = fragment.querySelector('.alarm-card');
    const time = fragment.querySelector('.alarm-time');
    const label = fragment.querySelector('.alarm-label');
    const meta = fragment.querySelector('.alarm-meta');
    const toggle = fragment.querySelector('.toggle-btn');
    const del = fragment.querySelector('.delete-btn');

    const next = nextTriggerForAlarm(alarm, now);
    time.textContent = formatAlarmTime(alarm);
    label.textContent = alarm.label || 'Alarm';
    meta.textContent = `${typeLabel(alarm.type)} · ${alarm.enabled ? formatNextTrigger(next) : 'Deaktiviert'}`;
    toggle.textContent = alarm.enabled ? 'Deaktivieren' : 'Aktivieren';
    card.classList.toggle('disabled', !alarm.enabled);

    toggle.addEventListener('click', () => toggleAlarm(alarm.id));
    del.addEventListener('click', () => deleteAlarm(alarm.id));

    elements.list.appendChild(fragment);
  });
}

function createAlarmFromForm(event) {
  event.preventDefault();
  const { hour, minute } = normalizeHourMinute();
  const type = selectedType();
  const label = elements.labelInput.value.trim() || 'Alarm';
  const now = new Date();

  let triggerAt = null;
  if (type === 'once') {
    let dateText = elements.dateInput.value || toDateInputValue(now);
    let trigger = parseLocalDateTime(dateText, hour, minute);

    if (trigger <= now) {
      trigger = new Date(now);
      trigger.setDate(trigger.getDate() + 1);
      trigger.setHours(hour, minute, 0, 0);
      dateText = toDateInputValue(trigger);
      elements.dateInput.value = dateText;
    }
    triggerAt = trigger.toISOString();
  }

  const alarm = {
    id: uuid(),
    label,
    hour,
    minute,
    type,
    enabled: true,
    triggerAt,
    lastTriggeredKey: null,
    createdAt: new Date().toISOString(),
    temporary: false,
  };

  state.alarms.push(alarm);
  saveAlarms();
  renderAlarms();
  setStatus(`Alarm „${label}“ wurde für ${formatNextTrigger(nextTriggerForAlarm(alarm))} gespeichert.`);
}

function toggleAlarm(id) {
  const alarm = state.alarms.find((item) => item.id === id);
  if (!alarm) return;

  alarm.enabled = !alarm.enabled;
  alarm.lastTriggeredKey = null;

  if (alarm.enabled && alarm.type === 'once') {
    const now = new Date();
    let trigger = alarm.triggerAt ? new Date(alarm.triggerAt) : null;
    if (!trigger || Number.isNaN(trigger.getTime()) || trigger <= now) {
      trigger = new Date(now);
      trigger.setHours(alarm.hour, alarm.minute, 0, 0);
      if (trigger <= now) trigger.setDate(trigger.getDate() + 1);
      alarm.triggerAt = trigger.toISOString();
    }
  }

  saveAlarms();
  renderAlarms();
  setStatus(`Alarm „${alarm.label}“ wurde ${alarm.enabled ? 'aktiviert' : 'deaktiviert'}.`);
}

function deleteAlarm(id) {
  const alarm = state.alarms.find((item) => item.id === id);
  if (!alarm) return;
  state.alarms = state.alarms.filter((item) => item.id !== id);
  saveAlarms();
  renderAlarms();
  setStatus(`Alarm „${alarm.label}“ wurde gelöscht.`);
}

function clearDoneAlarms() {
  const before = state.alarms.length;
  state.alarms = state.alarms.filter((alarm) => {
    if (alarm.type !== 'once') return true;
    if (alarm.enabled) return true;
    return false;
  });
  saveAlarms();
  renderAlarms();
  setStatus(`${before - state.alarms.length} erledigte einmalige Alarme gelöscht.`);
}

function addQuickAlarm(minutes) {
  const trigger = new Date(Date.now() + minutes * 60 * 1000);
  elements.hourInput.value = pad2(trigger.getHours());
  elements.minuteInput.value = pad2(trigger.getMinutes());
  elements.dateInput.value = toDateInputValue(trigger);
  document.querySelector('input[name="alarmType"][value="once"]').checked = true;
  updateDateVisibility();
  elements.labelInput.value = `Timer ${minutes} min`;
  setStatus(`Schnellwecker auf ${pad2(trigger.getHours())}:${pad2(trigger.getMinutes())} gesetzt. Zum Speichern „Alarm hinzufügen“ klicken.`);
}

function triggerKey(alarm, trigger) {
  if (alarm.type === 'once') return alarm.id;
  return `${alarm.id}-${toDateInputValue(trigger)}-${pad2(trigger.getHours())}${pad2(trigger.getMinutes())}`;
}

function checkAlarms() {
  if (state.activeAlarm) return;

  const now = new Date();
  const due = state.alarms.find((alarm) => {
    if (!alarm.enabled) return false;
    const trigger = nextTriggerForAlarm(alarm, now);
    if (!trigger) return false;
    const key = triggerKey(alarm, trigger);
    if (alarm.lastTriggeredKey === key) return false;
    return trigger.getTime() <= now.getTime() + CHECK_INTERVAL_MS;
  });

  if (due) startRinging(due);
}

function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!state.audio) {
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);
    state.audio = {
      context,
      gain,
      oscillators: [],
      interval: null,
    };
  }
  return state.audio;
}

async function startSound() {
  const audio = ensureAudioContext();
  if (!audio) {
    setStatus('Dieser Browser unterstützt Web-Audio nicht.');
    return;
  }

  if (audio.context.state === 'suspended') {
    await audio.context.resume();
  }

  stopSound();

  const volume = Number(elements.volumeInput.value) || 0.65;
  const osc1 = audio.context.createOscillator();
  const osc2 = audio.context.createOscillator();
  osc1.type = 'sine';
  osc2.type = 'triangle';
  osc1.frequency.value = 880;
  osc2.frequency.value = 1320;
  osc1.connect(audio.gain);
  osc2.connect(audio.gain);
  osc1.start();
  osc2.start();
  audio.oscillators = [osc1, osc2];

  let on = false;
  audio.interval = window.setInterval(() => {
    on = !on;
    const now = audio.context.currentTime;
    audio.gain.gain.cancelScheduledValues(now);
    audio.gain.gain.setTargetAtTime(on ? volume : 0.001, now, 0.015);
  }, 420);
}

function stopSound() {
  if (!state.audio) return;
  if (state.audio.interval) {
    window.clearInterval(state.audio.interval);
    state.audio.interval = null;
  }
  state.audio.gain.gain.value = 0;
  state.audio.oscillators.forEach((osc) => {
    try { osc.stop(); } catch (_error) { /* already stopped */ }
    try { osc.disconnect(); } catch (_error) { /* already disconnected */ }
  });
  state.audio.oscillators = [];
}

function notify(alarm) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification('Finns Wecker', {
      body: `${formatAlarmTime(alarm)} · ${alarm.label || 'Alarm'}`,
      tag: alarm.id,
      requireInteraction: true,
    });
  } catch (_error) {
    // Some browsers block notifications in local file contexts.
  }
}

async function startRinging(alarm) {
  const trigger = nextTriggerForAlarm(alarm) || new Date();
  alarm.lastTriggeredKey = triggerKey(alarm, trigger);
  if (alarm.type === 'once') alarm.enabled = false;
  saveAlarms();
  renderAlarms();

  state.activeAlarm = alarm;
  elements.ringTime.textContent = formatAlarmTime(alarm);
  elements.ringLabel.textContent = alarm.label || 'Alarm';
  elements.overlay.classList.remove('hidden');
  elements.stopBtn.focus();
  setStatus(`Alarm „${alarm.label}“ läuft.`);

  if (elements.vibrateInput.checked && navigator.vibrate) {
    navigator.vibrate([300, 120, 300, 120, 600]);
  }
  notify(alarm);
  await startSound();
}

function stopRinging() {
  stopSound();
  if (navigator.vibrate) navigator.vibrate(0);
  elements.overlay.classList.add('hidden');
  const label = state.activeAlarm ? state.activeAlarm.label : 'Alarm';
  state.activeAlarm = null;
  setStatus(`Alarm „${label}“ gestoppt.`);
}

function snooze(minutes) {
  const original = state.activeAlarm;
  stopRinging();
  if (!original) return;

  const trigger = new Date(Date.now() + minutes * 60 * 1000);
  const alarm = {
    id: uuid(),
    label: `Snooze: ${original.label || 'Alarm'}`,
    hour: trigger.getHours(),
    minute: trigger.getMinutes(),
    type: 'once',
    enabled: true,
    triggerAt: trigger.toISOString(),
    lastTriggeredKey: null,
    createdAt: new Date().toISOString(),
    temporary: true,
  };
  state.alarms.push(alarm);
  saveAlarms();
  renderAlarms();
  setStatus(`Snooze für ${minutes} Minuten erstellt.`);
}

async function requestNotifications() {
  if (!('Notification' in window)) {
    setStatus('Dieser Browser unterstützt keine Benachrichtigungen.');
    return;
  }
  const permission = await Notification.requestPermission();
  setStatus(permission === 'granted'
    ? 'Benachrichtigungen sind aktiviert.'
    : 'Benachrichtigungen sind nicht aktiviert. Der Alarm funktioniert trotzdem im geöffneten Tab.');
}

async function toggleWakeLock() {
  if (!('wakeLock' in navigator)) {
    setStatus('Wake Lock wird von diesem Browser nicht unterstützt.');
    return;
  }

  try {
    if (state.wakeLock) {
      await state.wakeLock.release();
      state.wakeLock = null;
      elements.wakeLockBtn.textContent = 'Wachhalten';
      setStatus('Wachhalten deaktiviert.');
      return;
    }

    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => {
      state.wakeLock = null;
      elements.wakeLockBtn.textContent = 'Wachhalten';
    });
    elements.wakeLockBtn.textContent = 'Wachhalten aktiv';
    setStatus('Bildschirm-Wachhalten aktiviert, solange der Tab offen bleibt.');
  } catch (error) {
    setStatus(`Wake Lock konnte nicht aktiviert werden: ${error.message}`);
  }
}

function updateClock() {
  const now = new Date();
  elements.clock.textContent = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now);
  elements.today.textContent = formatDateLong(now);
}

function updateDateVisibility() {
  const isOnce = selectedType() === 'once';
  elements.dateField.style.display = isOnce ? 'grid' : 'none';
  elements.dateInput.required = isOnce;
}

function setDefaultFormValues() {
  const now = new Date();
  const defaultAlarm = new Date(now.getTime() + 10 * 60 * 1000);
  elements.hourInput.value = pad2(defaultAlarm.getHours());
  elements.minuteInput.value = pad2(defaultAlarm.getMinutes());
  elements.dateInput.value = toDateInputValue(defaultAlarm);
}

function bindEvents() {
  elements.form.addEventListener('submit', createAlarmFromForm);
  elements.hourInput.addEventListener('blur', normalizeHourMinute);
  elements.minuteInput.addEventListener('blur', normalizeHourMinute);
  elements.volumeInput.addEventListener('input', savePreferences);
  elements.vibrateInput.addEventListener('change', savePreferences);

  $$('[data-add-minutes]').forEach((button) => {
    button.addEventListener('click', () => addQuickAlarm(Number(button.dataset.addMinutes)));
  });

  $$('input[name="alarmType"]').forEach((input) => {
    input.addEventListener('change', updateDateVisibility);
  });

  elements.stopBtn.addEventListener('click', stopRinging);
  elements.snooze5Btn.addEventListener('click', () => snooze(5));
  elements.snooze10Btn.addEventListener('click', () => snooze(10));
  elements.notifyBtn.addEventListener('click', requestNotifications);
  elements.wakeLockBtn.addEventListener('click', toggleWakeLock);
  elements.clearDoneBtn.addEventListener('click', clearDoneAlarms);
  elements.testSoundBtn.addEventListener('click', async () => {
    setStatus('Testton läuft für zwei Sekunden.');
    await startSound();
    window.setTimeout(() => {
      stopSound();
      setStatus('Testton beendet.');
    }, 2000);
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && state.wakeLock) {
      try { state.wakeLock = await navigator.wakeLock.request('screen'); } catch (_error) { /* ignore */ }
    }
  });

  window.addEventListener('beforeunload', () => {
    stopSound();
    if (state.wakeLock) state.wakeLock.release();
  });
}

function boot() {
  setDefaultFormValues();
  loadPreferences();
  loadAlarms();
  updateDateVisibility();
  bindEvents();
  updateClock();
  renderAlarms();
  window.setInterval(updateClock, 250);
  window.setInterval(checkAlarms, CHECK_INTERVAL_MS);
}

boot();

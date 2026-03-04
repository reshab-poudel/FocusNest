const STORAGE_KEY = "focusnest_state_v1";
const ALARM_DURATION_SECONDS = 30;

const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const taskList = document.getElementById("taskList");
const taskSummary = document.getElementById("taskSummary");

const timerMinutesInput = document.getElementById("timerMinutes");
const timerDisplay = document.getElementById("timerDisplay");
const startPauseBtn = document.getElementById("startPauseBtn");
const resetBtn = document.getElementById("resetBtn");

const notesInput = document.getElementById("notes");

const defaultState = {
  tasks: [],
  notes: "",
  timerMinutes: 25
};

let state = loadState();
let remainingSeconds = state.timerMinutes * 60;
let intervalId = null;
let audioContext = null;
let activeAlarmNodes = [];
let alarmTimeoutId = null;

init();

function init() {
  bindEvents();
  render();
}

function bindEvents() {
  taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = taskInput.value.trim();
    if (!title) {
      return;
    }

    state.tasks.unshift({
      id: makeId(),
      title,
      done: false
    });

    taskForm.reset();
    saveState();
    renderTasks();
  });

  taskList.addEventListener("change", (event) => {
    const target = event.target;
    if (!target.matches("input[data-action='toggle']")) {
      return;
    }

    const id = target.getAttribute("data-id");
    const task = state.tasks.find((item) => item.id === id);
    if (!task) {
      return;
    }

    task.done = target.checked;
    saveState();
    renderTasks();
  });

  taskList.addEventListener("click", (event) => {
    const target = event.target;
    if (!target.matches("button[data-action='delete']")) {
      return;
    }

    const id = target.getAttribute("data-id");
    state.tasks = state.tasks.filter((task) => task.id !== id);
    saveState();
    renderTasks();
  });

  timerMinutesInput.addEventListener("change", () => {
    const minutes = clamp(Number(timerMinutesInput.value), 5, 90, 25);
    state.timerMinutes = minutes;
    timerMinutesInput.value = String(minutes);
    stopTimer(false);
    stopSoftAlarm();
    remainingSeconds = minutes * 60;
    saveState();
    renderTimer();
  });

  startPauseBtn.addEventListener("click", () => {
    if (intervalId) {
      stopTimer();
      return;
    }

    ensureAudioContext();
    stopSoftAlarm();
    startTimer();
  });

  resetBtn.addEventListener("click", () => {
    stopTimer(false);
    stopSoftAlarm();
    remainingSeconds = state.timerMinutes * 60;
    renderTimer();
  });

  notesInput.addEventListener("input", () => {
    state.notes = notesInput.value;
    saveState();
  });

  window.addEventListener("beforeunload", () => {
    stopTimer(false);
    stopSoftAlarm();
    saveState();
  });
}

function render() {
  notesInput.value = state.notes;
  timerMinutesInput.value = String(state.timerMinutes);
  renderTasks();
  renderTimer();
}

function renderTasks() {
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.done).length;
  taskSummary.textContent = `${completed} of ${total} completed`;

  if (total === 0) {
    taskList.innerHTML = "<li class='task-item'><span>No tasks yet.</span></li>";
    return;
  }

  taskList.innerHTML = state.tasks
    .map(
      (task) => `
      <li class="task-item ${task.done ? "done" : ""}">
        <input type="checkbox" data-action="toggle" data-id="${task.id}" ${task.done ? "checked" : ""} />
        <span class="task-title">${escapeHtml(task.title)}</span>
        <button class="small secondary" type="button" data-action="delete" data-id="${task.id}">Delete</button>
      </li>
    `
    )
    .join("");
}

function startTimer() {
  if (intervalId) {
    return;
  }

  if (remainingSeconds <= 0) {
    remainingSeconds = state.timerMinutes * 60;
  }

  intervalId = setInterval(() => {
    remainingSeconds -= 1;

    if (remainingSeconds <= 0) {
      handleTimerComplete();
      return;
    }

    renderTimer();
  }, 1000);

  renderTimer();
}

function handleTimerComplete() {
  remainingSeconds = 0;
  stopTimer(false);
  renderTimer();
  playSoftAlarm(ALARM_DURATION_SECONDS);
}

function stopTimer(updateButton = true) {
  clearInterval(intervalId);
  intervalId = null;
  if (updateButton) {
    renderTimer();
  }
}

function renderTimer() {
  timerDisplay.textContent = formatTime(remainingSeconds);
  startPauseBtn.textContent = intervalId ? "Pause" : "Start";
  timerDisplay.classList.toggle("timer-finished", remainingSeconds === 0);
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const mins = String(Math.floor(safe / 60)).padStart(2, "0");
  const secs = String(safe % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return freshDefault();
    }

    const parsed = JSON.parse(raw);
    const timerMinutes = clamp(Number(parsed.timerMinutes), 5, 90, 25);

    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      timerMinutes
    };
  } catch (error) {
    return freshDefault();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function freshDefault() {
  return JSON.parse(JSON.stringify(defaultState));
}

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ensureAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return null;
  }

  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function playSoftAlarm(durationSeconds) {
  const ctx = ensureAudioContext();
  if (!ctx) {
    return;
  }

  stopSoftAlarm();

  const notes = [261.63, 329.63, 392.0, 523.25];
  const noteStepSeconds = 1.1;
  const noteLengthSeconds = 0.9;
  const alarmStart = ctx.currentTime + 0.03;
  const alarmEnd = alarmStart + durationSeconds;

  for (let index = 0, start = alarmStart; start < alarmEnd; index += 1, start += noteStepSeconds) {
    const freq = notes[index % notes.length];
    const noteEnd = Math.min(start + noteLengthSeconds, alarmEnd);

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(freq, start);
    oscillator.frequency.linearRampToValueAtTime(freq * 1.015, noteEnd);

    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.exponentialRampToValueAtTime(0.028, start + 0.12);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(start);
    oscillator.stop(noteEnd);

    activeAlarmNodes.push({ oscillator, gainNode });
  }

  alarmTimeoutId = setTimeout(() => {
    activeAlarmNodes = [];
    alarmTimeoutId = null;
  }, Math.ceil(durationSeconds * 1000) + 250);
}

function stopSoftAlarm() {
  clearTimeout(alarmTimeoutId);
  alarmTimeoutId = null;

  if (!audioContext || activeAlarmNodes.length === 0) {
    activeAlarmNodes = [];
    return;
  }

  const now = audioContext.currentTime;
  const quickStopAt = now + 0.12;

  activeAlarmNodes.forEach(({ oscillator, gainNode }) => {
    try {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setTargetAtTime(0.0001, now, 0.04);
      oscillator.stop(quickStopAt);
    } catch (error) {
      // Ignore nodes already stopped.
    }
  });

  activeAlarmNodes = [];
}

document.addEventListener("DOMContentLoaded", () => {

/* ================= CONSTANTS ================= */
const BASE_PUSH = 1;
const BASE_ENDURANCE = 100;
const ENDURANCE_PER_LEVEL = 10;
const ENDURANCE_DRAIN = 6;

const BASE_GRAVITY = 0.8;
const GRAVITY_HEIGHT_SCALE = 0.002;

const SLIP_CHANCE = 0.03; // rare
const XP_PER_HEIGHT = 0.5;
const XP_LEVEL_BASE = 50;
const XP_LEVEL_SCALE = 1.3;

const MAX_HEIGHT = 500;
const FAKE_ESCAPE_HEIGHT = 480;
const SAVE_KEY = "sisyphus_save_v2";

// Audio
const BASE_FREQUENCY = 200;
const FREQUENCY_SCALE = 0.5;
const MAX_FREQUENCY = 2000;

/* ================= GAME STATE ================= */
let runCount = 1;
let level = 1;
let xp = 0;
let gameSpeed = 1;

let state = {
  height: 0,
  endurance: BASE_ENDURANCE,
  maxEndurance: BASE_ENDURANCE,
  alive: true,
  recovering: false,

  gripStrength: 0,
  sandalsChance: 0,

  hasLeftBottom: false,
  fallTime: 0,

  forcedFall: false,
  fakeEscapeTriggered: false,

  audioStarted: false
};

/* ================= DOM ================= */
const heightEl = document.getElementById("height");
const enduranceEl = document.getElementById("endurance");
const runEl = document.getElementById("run");
const levelEl = document.getElementById("level");
const xpTextEl = document.getElementById("xp-text");
const gameSpeedEl = document.getElementById("game-speed");
const gripStrengthEl = document.getElementById("grip-strength");
const sandalsChanceEl = document.getElementById("sandals-chance");
const godsEl = document.getElementById("gods-comment");
const logEl = document.getElementById("log");

const pushBtn = document.getElementById("pushBtn");
const resetAllBtn = document.getElementById("resetAllBtn");
const sacrificeSpeedBtn = document.getElementById("sacrificeSpeedBtn");
const sacrificeGripBtn = document.getElementById("sacrificeGripBtn");
const upgradeSandalsBtn = document.getElementById("upgradeSandalsBtn");

const hillContainer = document.getElementById("hill-container");
const sisyphusImg = document.getElementById("sisyphus-img");

/* ================= AUDIO ================= */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const gainNode = audioCtx.createGain();
gainNode.gain.value = 0.3;
gainNode.connect(audioCtx.destination);
let oscillator = null;

function startAudio() {
  if (state.audioStarted) return;
  state.audioStarted = true;
  if (audioCtx.state === "suspended") audioCtx.resume();

  oscillator = audioCtx.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.value = BASE_FREQUENCY;
  oscillator.connect(gainNode);
  oscillator.start();
}

function stopAudio() {
  if (!oscillator) return;
  oscillator.stop();
  oscillator.disconnect();
  oscillator = null;
}

function updateTone() {
  if (!oscillator) return;
  const freq = Math.min(
    MAX_FREQUENCY,
    BASE_FREQUENCY + state.height * FREQUENCY_SCALE
  );
  oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
}

/* ================= UTIL ================= */
function log(msg) {
  const div = document.createElement("div");
  div.className = "log-entry";
  div.textContent = msg;
  logEl.prepend(div);
}

function xpToNextLevel() {
  return Math.floor(XP_LEVEL_BASE * Math.pow(XP_LEVEL_SCALE, level - 1));
}

/* ================= UI ================= */
function updateUI() {
  heightEl.textContent = Math.floor(state.height);
  enduranceEl.textContent = Math.floor(state.endurance);
  runEl.textContent = runCount;
  levelEl.textContent = level;
  xpTextEl.textContent = `${Math.floor(xp)} / ${xpToNextLevel()}`;
  gameSpeedEl.textContent = gameSpeed.toFixed(2);
  gripStrengthEl.textContent = `${state.gripStrength}%`;
  sandalsChanceEl.textContent = `${state.sandalsChance}%`;

  sacrificeGripBtn.disabled = state.gripStrength >= 100;
  upgradeSandalsBtn.disabled = state.sandalsChance >= 100;

  updateSisyphusPosition();
}

/* ================= SAVE / LOAD ================= */
function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    level, xp, gameSpeed, runCount,
    endurance: state.endurance,
    maxEndurance: state.maxEndurance,
    gripStrength: state.gripStrength,
    sandalsChance: state.sandalsChance
  }));
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;

  const data = JSON.parse(raw);
  level = data.level ?? level;
  xp = data.xp ?? xp;
  gameSpeed = data.gameSpeed ?? gameSpeed;
  runCount = data.runCount ?? runCount;

  state.endurance = data.endurance ?? state.endurance;
  state.maxEndurance = data.maxEndurance ?? state.maxEndurance;
  state.gripStrength = data.gripStrength ?? state.gripStrength;
  state.sandalsChance = data.sandalsChance ?? state.sandalsChance;
}

/* ================= LEVELING ================= */
function applyLevelUps() {
  while (xp >= xpToNextLevel()) {
    xp -= xpToNextLevel();
    level++;
    state.maxEndurance = BASE_ENDURANCE + level * ENDURANCE_PER_LEVEL;
    state.endurance = state.maxEndurance;
    log(`You grow stronger. Level ${level}.`);
  }
}

/* ================= PUSH ================= */
function pushBoulder() {
  if (!state.alive || state.recovering) return;

  startAudio();

  state.height += BASE_PUSH * gameSpeed;
  state.height = Math.min(state.height, MAX_HEIGHT - 1);
  state.hasLeftBottom = true;
  state.fallTime = 0;

  if (Math.random() * 100 >= state.sandalsChance) {
    state.endurance -= ENDURANCE_DRAIN * gameSpeed;
  }

  xp += XP_PER_HEIGHT;
  applyLevelUps();

  if (state.height >= FAKE_ESCAPE_HEIGHT && !state.fakeEscapeTriggered) {
    triggerFakeEscape();
  }

  if (state.endurance <= 0) {
    state.endurance = 0;
    state.alive = false;
    log("Your strength fails. The boulder slips from your grasp.");
  }

  updateUI();
  updateTone();
}

/* ================= FAKE ESCAPE ================= */
function triggerFakeEscape() {
  state.fakeEscapeTriggered = true;
  state.forcedFall = true;
  state.endurance = 0;
  log("You glimpse freedom.");
  log("The gods laugh.");
  stopAudio();
}

/* ================= GRAVITY ================= */
function applyGravity() {
  if (state.height <= 0) return;

  state.fallTime += 0.2;
  const gravity =
    (BASE_GRAVITY + state.height * GRAVITY_HEIGHT_SCALE) *
    (1 + state.fallTime * 0.05);

  state.height -= gravity;

  if (state.height <= 0) {
    state.height = 0;
    state.fallTime = 0;
    state.forcedFall = false;
    beginRecovery();
  }

  updateUI();
  updateTone();
}

/* ================= SLIP ================= */
function checkSlip() {
  if (!state.alive || state.height <= 0) return;

  const chance =
    SLIP_CHANCE +
    state.height * 0.0003 -
    state.gripStrength / 200;

  if (Math.random() < chance) {
    log("The boulder slips!");
    state.endurance = 0;
    state.alive = false;
  }
}

/* ================= RECOVERY ================= */
function beginRecovery() {
  if (state.recovering) return;
  state.recovering = true;
  state.audioStarted = false;
  stopAudio();

  log("You collapse at the foot of the hill.");
  log("Time passes.");

  const regen = setInterval(() => {
    state.endurance += state.maxEndurance * 0.05;
    if (state.endurance >= state.maxEndurance) {
      state.endurance = state.maxEndurance;
      state.recovering = false;
      state.alive = true;
      runCount++;
      log("The gods command you to begin again.");
      clearInterval(regen);
    }
    updateUI();
  }, 500);
}

/* ================= VISUAL ================= */
function updateSisyphusPosition() {
  const maxX = hillContainer.clientWidth - sisyphusImg.clientWidth;
  sisyphusImg.style.left = (state.height / MAX_HEIGHT) * maxX + "px";
}

/* ================= INPUT ================= */
let pushInterval = null;
pushBtn.addEventListener("mousedown", () => {
  pushBoulder();
  pushInterval = setInterval(pushBoulder, 100);
});
["mouseup", "mouseleave"].forEach(e =>
  pushBtn.addEventListener(e, () => clearInterval(pushInterval))
);

resetAllBtn.addEventListener("click", () => {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
});

/* ================= LOOPS ================= */
setInterval(applyGravity, 200);
setInterval(checkSlip, 1000);

loadGame();
updateUI();
log("The hill awaits.");

});
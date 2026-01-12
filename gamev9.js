document.addEventListener("DOMContentLoaded", () => {

/* =====================
   CONSTANTS
===================== */
const BASE_PUSH = 1;
const BASE_ENDURANCE = 100;
const ENDURANCE_PER_LEVEL = 10;
const ENDURANCE_DRAIN = 6;

const BASE_GRAVITY = 0.8;
const GRAVITY_HEIGHT_SCALE = 0.002;

const SLIP_CHANCE = 0.02; // rare
const XP_PER_HEIGHT = 0.5;
const XP_LEVEL_BASE = 50;
const XP_LEVEL_SCALE = 1.3;

const MAX_HEIGHT = 500;
const FAKE_ESCAPE_HEIGHT = 480;
const SAVE_KEY = "sisyphus_save_v1";

// Audio
const BASE_FREQUENCY = 200;
const FREQUENCY_SCALE = 0.5;
const MAX_FREQUENCY = 2000;

/* =====================
   CORE STATE
===================== */
let gameSpeed = 1;
let runCount = 1;
let level = 1;
let xp = 0;

let state = {
  height: 0,
  endurance: BASE_ENDURANCE,
  maxEndurance: BASE_ENDURANCE,
  alive: true,

  gripStrength: 0,
  sandalsChance: 0,

  hasLeftBottom: false,
  forcedFall: false,
  fakeEscapeTriggered: false,

  fallTime: 0,
  recovering: false,
  audioStarted: false
};

/* =====================
   DOM
===================== */
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

/* =====================
   AUDIO
===================== */
const audioCtx = new (window.AudioContext||window.webkitAudioContext)();
const gainNode = audioCtx.createGain();
gainNode.gain.value = 0.3;
gainNode.connect(audioCtx.destination);

let oscillator = null;

function startAudio(){
  if(state.audioStarted) return;
  state.audioStarted = true;

  if(audioCtx.state === "suspended") audioCtx.resume();

  oscillator = audioCtx.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.value = BASE_FREQUENCY;
  oscillator.connect(gainNode);
  oscillator.start();
}

function stopAudio(){
  if(!oscillator) return;
  oscillator.stop();
  oscillator.disconnect();
  oscillator = null;
  state.audioStarted = false;
}

function updateTone(){
  if(!oscillator) return;
  const freq = Math.min(
    MAX_FREQUENCY,
    BASE_FREQUENCY + state.height * FREQUENCY_SCALE * gameSpeed
  );
  oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
}

/* =====================
   UI
===================== */
function xpToNext(){ return Math.floor(XP_LEVEL_BASE * Math.pow(XP_LEVEL_SCALE, level-1)); }

function updateUI(){
  heightEl.textContent = Math.floor(state.height);
  enduranceEl.textContent = Math.max(0, Math.floor(state.endurance));
  runEl.textContent = runCount;
  levelEl.textContent = level;
  xpTextEl.textContent = `${Math.floor(xp)} / ${xpToNext()}`;
  gameSpeedEl.textContent = gameSpeed.toFixed(2);
  gripStrengthEl.textContent = `${state.gripStrength}%`;
  sandalsChanceEl.textContent = `${state.sandalsChance}%`;

  sacrificeGripBtn.disabled = state.gripStrength >= 100;
  upgradeSandalsBtn.disabled = state.sandalsChance >= 100;

  updateSisyphusPosition();
}

/* =====================
   LOGGING
===================== */
function log(msg){
  const div = document.createElement("div");
  div.className = "log-entry";
  div.textContent = msg;
  logEl.prepend(div);
}

/* =====================
   SAVE / LOAD
===================== */
function saveGame(){
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    level, xp, gameSpeed, runCount,
    state: {
      endurance: state.endurance,
      maxEndurance: state.maxEndurance,
      gripStrength: state.gripStrength,
      sandalsChance: state.sandalsChance
    }
  }));
}

function loadGame(){
  const raw = localStorage.getItem(SAVE_KEY);
  if(!raw) return;

  try{
    const data = JSON.parse(raw);
    level = data.level ?? level;
    xp = data.xp ?? xp;
    gameSpeed = data.gameSpeed ?? gameSpeed;
    runCount = data.runCount ?? runCount;

    Object.assign(state, data.state || {});
  }catch{}
  updateUI();
}

/* =====================
   LEVELING
===================== */
function applyLevelUps(){
  while(xp >= xpToNext()){
    xp -= xpToNext();
    level++;
    state.maxEndurance = BASE_ENDURANCE + level * ENDURANCE_PER_LEVEL;
    state.endurance = state.maxEndurance;
    log(`You grow accustomed to suffering. Level ${level}.`);
  }
}

/* =====================
   PUSH
===================== */
function pushBoulder(){
  if(!state.alive || state.forcedFall) return;

  startAudio();

  state.height += BASE_PUSH * gameSpeed;
  if(state.height >= MAX_HEIGHT) state.height = MAX_HEIGHT - 1;

  state.fallTime = 0;
  state.hasLeftBottom = true;

  if(Math.random()*100 >= state.sandalsChance){
    const mult = Math.max(1, 1 + state.height * 0.01);
    state.endurance -= ENDURANCE_DRAIN * mult * gameSpeed;
  }

  xp += XP_PER_HEIGHT * gameSpeed;
  applyLevelUps();

  if(state.height >= FAKE_ESCAPE_HEIGHT && !state.fakeEscapeTriggered){
    triggerFakeEscape();
  }

  if(state.endurance <= 0){
    state.endurance = 0;
    pushBtn.disabled = true;
    log("Your strength fails.");
  }

  updateTone();
  updateUI();
}

/* =====================
   FAKE ESCAPE
===================== */
function triggerFakeEscape(){
  state.fakeEscapeTriggered = true;
  state.forcedFall = true;
  state.endurance = 0;

  log("The summit appears.");
  log("Freedom flickers.");
  log("The gods laugh.");

  stopAudio();
}

/* =====================
   GRAVITY (GLOBAL SPEED)
===================== */
function applyGravity(){
  if(state.height <= 0) return;

  state.fallTime += 0.2 * gameSpeed;

  const gravity =
    (BASE_GRAVITY + state.height * GRAVITY_HEIGHT_SCALE) *
    (1 + state.fallTime * 0.05);

  state.height -= gravity * gameSpeed;

  if(state.height <= 0){
    state.height = 0;
    state.fallTime = 0;
    beginRecovery();
  }

  updateTone();
  updateUI();
}

/* =====================
   SLIP
===================== */
function checkSlip(){
  if(!state.alive || state.height <= 0) return;

  const chance = Math.max(
    0,
    SLIP_CHANCE + state.height*0.001 - state.gripStrength/100
  );

  if(Math.random() < chance){
    const loss = state.height * (0.1 + Math.random()*0.1);
    state.height -= loss;
    log("The boulder slips.");
  }
}

/* =====================
   RECOVERY
===================== */
function beginRecovery(){
  if(state.recovering) return;
  state.recovering = true;
  state.alive = false;
  state.forcedFall = false;
  state.fakeEscapeTriggered = false;

  log("You collapse at the foot of the hill.");

  const regen = setInterval(()=>{
    state.endurance += state.maxEndurance * 0.05 * gameSpeed;

    if(state.endurance >= state.maxEndurance){
      state.endurance = state.maxEndurance;
      state.alive = true;
      state.recovering = false;
      pushBtn.disabled = false;
      runCount++;
      clearInterval(regen);
      log("You rise to suffer again.");
    }
    updateUI();
  }, 300);
}

/* =====================
   VISUAL
===================== */
function updateSisyphusPosition(){
  const maxX = hillContainer.clientWidth - sisyphusImg.clientWidth;
  sisyphusImg.style.left = (state.height / MAX_HEIGHT) * maxX + "px";
}

/* =====================
   LOOP
===================== */
setInterval(()=>{
  if(Math.random() < gameSpeed) checkSlip();
  applyGravity();
}, 100);

/* =====================
   EVENTS
===================== */
pushBtn.addEventListener("mousedown", pushBoulder);
resetAllBtn.addEventListener("click", ()=>{
  localStorage.removeItem(SAVE_KEY);
  location.reload();
});

/* =====================
   INIT
===================== */
loadGame();
updateUI();

});

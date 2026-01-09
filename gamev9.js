document.addEventListener("DOMContentLoaded", () => {

let gameSpeed = 1;
const BASE_PUSH = 1;
const BASE_ENDURANCE = 100;
const ENDURANCE_PER_LEVEL = 10;
const ENDURANCE_DRAIN = 6;
const BASE_GRAVITY = 0.8;
const GRAVITY_HEIGHT_SCALE = 0.002;
const SLIP_CHANCE = 0.05;
const XP_PER_HEIGHT = 0.5;
const XP_LEVEL_BASE = 50;
const XP_LEVEL_SCALE = 1.3;
const MAX_HEIGHT = 500; // Goal
const SAVE_KEY = "sisyphus_save_v1";
const FAKE_ESCAPE_HEIGHT = 480;

// Audio constants
const BASE_FREQUENCY = 200;
const FREQUENCY_SCALE = 0.5;
const MAX_FREQUENCY = 2000;

// Game state
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
  runXP: 0,
  hasLeftBottom: false,
  audioStarted: false,
  fallTime: 0,
  fakeEscapeTriggered: false,
  forcedFall: false,
  pendingReset: false
};

// DOM elements
const heightEl = document.getElementById("height");
const enduranceEl = document.getElementById("endurance");
const runEl = document.getElementById("run");
const levelEl = document.getElementById("level");
const xpTextEl = document.getElementById("xp-text");
const logEl = document.getElementById("log");
const godsEl = document.getElementById("gods-comment");
const gameSpeedEl = document.getElementById("game-speed");
const gripStrengthEl = document.getElementById("grip-strength");
const sandalsChanceEl = document.getElementById("sandals-chance");

const pushBtn = document.getElementById("pushBtn");
const resetAllBtn = document.getElementById("resetAllBtn");
const sacrificeSpeedBtn = document.getElementById("sacrificeSpeedBtn");
const sacrificeGripBtn = document.getElementById("sacrificeGripBtn");
const upgradeSandalsBtn = document.getElementById("upgradeSandalsBtn");

const hillContainer = document.getElementById("hill-container");
const sisyphusImg = document.getElementById("sisyphus-img");

// ---- Audio ----
const audioCtx = new (window.AudioContext||window.webkitAudioContext)();
let oscillator = null;
const gainNode = audioCtx.createGain();
gainNode.gain.value = 0.3;
gainNode.connect(audioCtx.destination);

function startAudioOnce(){
  if(state.audioStarted) return;
  state.audioStarted = true;
  if(audioCtx.state === "suspended") audioCtx.resume();
  oscillator = audioCtx.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(BASE_FREQUENCY, audioCtx.currentTime);
  oscillator.connect(gainNode);
  oscillator.start();
}

function stopAudio(){
  if(!oscillator) return;
  oscillator.stop();
  oscillator.disconnect();
  oscillator = null;
}

function updateTone(){
  if(!oscillator) return;
  let freq = Math.min(MAX_FREQUENCY, BASE_FREQUENCY + state.height*FREQUENCY_SCALE);
  oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
}

// ---- Utility ----
function log(msg){ const div=document.createElement("div"); div.className="log-entry"; div.textContent=msg; logEl.prepend(div); }
function xpToNextLevel(){ return Math.floor(XP_LEVEL_BASE * Math.pow(XP_LEVEL_SCALE, level-1)); }

function updateUI(){
  heightEl.textContent = Math.floor(state.height);
  enduranceEl.textContent = Math.max(0, Math.floor(state.endurance));
  runEl.textContent = runCount;
  levelEl.textContent = level;
  xpTextEl.textContent = `${Math.floor(xp)} / ${xpToNextLevel()}`;
  gameSpeedEl.textContent = gameSpeed.toFixed(2);
  gripStrengthEl.textContent = `${state.gripStrength}%`;
  sandalsChanceEl.textContent = `${state.sandalsChance}%`;
  sacrificeGripBtn.disabled = state.gripStrength>=100;
  upgradeSandalsBtn.disabled = state.sandalsChance>=100;
  updateSisyphusPosition();
}

// ---- Save Game ----
function saveGame() {
  const saveData = {
    level: level,
    xp: xp,
    state: {
      endurance: state.endurance,
      maxEndurance: state.maxEndurance,
      gripStrength: state.gripStrength,
      sandalsChance: state.sandalsChance
    },
    gameSpeed: gameSpeed,
    runCount: runCount
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

// ---- Load Game ----
function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);

    level = data.level ?? level;
    xp = data.xp ?? xp;
    gameSpeed = data.gameSpeed ?? gameSpeed;
    runCount = data.runCount ?? runCount;

    if (data.state) {
      state.endurance = data.state.endurance ?? state.endurance;
      state.maxEndurance = data.state.maxEndurance ?? state.maxEndurance;
      state.gripStrength = data.state.gripStrength ?? state.gripStrength;
      state.sandalsChance = data.state.sandalsChance ?? state.sandalsChance;
    }

  } catch (e) {
    console.warn("Save data corrupted, ignoring.");
  }

  updateUI();
}

// ---- Reset All Progress ----
function resetAllProgress(){
  if(!confirm("This will erase all progress. The gods will not remember you. Continue?")) return;

  localStorage.removeItem(SAVE_KEY);

  // Core progression
  level = 1;
  xp = 0;
  gameSpeed = 1;
  runCount = 1;

  // State reset
  state.height = 0;
  state.maxEndurance = BASE_ENDURANCE;
  state.endurance = BASE_ENDURANCE;
  state.alive = true;
  state.gripStrength = 0;
  state.sandalsChance = 0;
  state.runXP = 0;
  state.hasLeftBottom = false;
  state.audioStarted = false;
  state.fallTime = 0;
  state.fakeEscapeTriggered = false;
  state.forcedFall = false;
  state.pendingReset = false;

  stopAudio();
  pushBtn.disabled = false;

  log("--- All memory erased ---");
  log("You are returned to the hill, unknown and unchanged.");

  updateUI();
}

// ---- Leveling ----
function applyLevelUps(){
  while(xp >= xpToNextLevel()){
    xp -= xpToNextLevel();
    level++;
    state.maxEndurance = BASE_ENDURANCE + level*ENDURANCE_PER_LEVEL;
    state.endurance = state.maxEndurance;
    log(`You level up! Level ${level}`);
    saveGame();
  }
}

// ---- Gods ----
const godsLines = [
  "Is that all you’ve got?",
  "The hill mocks you.",
  "Try harder, mortal.",
  "You were warned",
  "The gods are disappointed.",
  "Your effort is laughable.",
  "You mistake motion for progress.",
  "The boulder feels heavier today, doesn’t it?",
  "Your struggle is amusing.",
  "Even a snail could push faster.",
  "Even Tantalus would feel pity for your effort.",
  "Your sweat smells like Hades’ stagnant river.",
  "Mortals were not meant to lift eternal burdens… yet here you are, failing.",
  "The Furies laugh at your feeble strength.",
  "Your push is slower than Hermes on a lazy day.",
  "Zeus is considering giving you wings… just to make you crash faster.",
  "Your endurance is weaker than a lotus-eater’s resolve.",
  "The hill whispers your name with contempt.",
  "Even Atlas rolls his eyes at you.",
  "Your ancestors flee in shame from your efforts.",
  "Hercules paused to mock your technique.",
  "The winds themselves mock your trembling legs.",
  "Your strength is less than a nymph’s gossip.",
  "Prometheus would find your persistence laughable.",
  "Your struggle amuses Hades more than the damned."
];
function godsSpeak(){ if(!state.alive) return; if(Math.random()<0.3) godsEl.textContent=godsLines[Math.floor(Math.random()*godsLines.length)]; }

// ---- Mechanics ----
function pushBoulder(){
  if(state.forcedFall) return;
  if(!state.alive) return;

  startAudioOnce();

  state.height += BASE_PUSH * gameSpeed;

  // Cap height slightly below max to make it impossible
  if(state.height >= MAX_HEIGHT) state.height = MAX_HEIGHT - 1;

  state.fallTime = 0;

  // Sandals chance: skip endurance drain if triggered
  if(Math.random()*100 >= state.sandalsChance){
    let enduranceMultiplier = Math.max(1, 1 + state.height * 0.01);
    state.endurance -= ENDURANCE_DRAIN * gameSpeed * enduranceMultiplier;
  }

  if(state.height > 0) state.hasLeftBottom = true;
  xp += XP_PER_HEIGHT;
  state.runXP += XP_PER_HEIGHT;
  applyLevelUps();

// Trigger fake escape near the top
if(
  state.height >= FAKE_ESCAPE_HEIGHT &&
  !state.fakeEscapeTriggered
){
  triggerFakeEscape();
}

  if(state.endurance <= 0){
    endRun("You collapse from exhaustion.");
    return;
  }

  updateUI();
  updateTone();
}

// ---- Fake Escape Mechanic ----
function triggerFakeEscape(){
  state.fakeEscapeTriggered = true;
  state.forcedFall = true;
  state.endurance = 0;

  log("The summit reveals itself.");
  log("Your heart surges.");
  log("The gods laugh.");

  godsEl.textContent = "You almost believed.";

  stopAudio();
}

function applyGravity(){
  if(!state.alive || state.height <= 0) return;

  state.fallTime += 0.2;
  let dynamicGravity = (BASE_GRAVITY + state.height * GRAVITY_HEIGHT_SCALE) * (1 + state.fallTime * 0.05);
  state.height -= dynamicGravity;

  if(state.height <= 0 && state.hasLeftBottom){
  state.height = 0;

  if(!state.pendingReset){
    state.pendingReset = true;
    state.alive = false;
    log("The boulder reaches the bottom.");
    log("You are condemned to begin again.");

    setTimeout(()=>{
      resetRun();
    }, 1200);
  }
}

  updateUI();
  updateTone();
}

function checkSlip(){
  if(!state.alive || state.height <= 0) return;
  let slipChance = Math.max(0, Math.min(1, SLIP_CHANCE + state.height*0.001 - state.gripStrength/100));
  if(Math.random() < slipChance){
    let loss = state.height*(0.1 + Math.random()*0.1);
    state.height -= loss;
    log(`The boulder slips! You fall ${loss.toFixed(1)} units.`);
    if(state.height <= 0 && state.hasLeftBottom){ state.height=0; endRun("The boulder drags you back to the bottom."); }
  }
  updateUI();
  updateTone();
}

// ---- Sisyphus visual ----
function updateSisyphusPosition() {
  const maxX = hillContainer.clientWidth - sisyphusImg.clientWidth;
  const x = Math.min(maxX, (state.height / MAX_HEIGHT) * maxX);
  sisyphusImg.style.left = x + "px";
}

// ---- Run End / Reset ----
function endRun(reason){
  state.alive=false;
  stopAudio();
  log(reason);
  log(`Final height: ${Math.floor(state.height)}`);
  pushBtn.disabled = true;
  updateUI();
  saveGame();
}

function resetRun(){
  runCount++;
  state.height = 0;
  state.endurance = state.maxEndurance;
  state.alive = true;
  pushBtn.disabled = false;
  state.hasLeftBottom = false;
  state.fallTime = 0;
  state.fakeEscapeTriggered = false;
  state.forcedFall = false;
  state.pendingReset = false;
  state.fakeEscapeTriggered = false; 

  stopAudio();
  state.audioStarted = false;
  saveGame();
  log("--- New ascent begins ---");
  updateUI();

}

// ---- Hold-to-push Buttons ----
let pushInterval = null;
pushBtn.addEventListener("mousedown", ()=>{
  if(!state.alive) return;
  pushBoulder();
  pushInterval = setInterval(pushBoulder, 100);
});
pushBtn.addEventListener("mouseup", ()=>clearInterval(pushInterval));
pushBtn.addEventListener("mouseleave", ()=>clearInterval(pushInterval));
pushBtn.addEventListener("touchstart", e=>{ e.preventDefault(); pushBoulder(); pushInterval=setInterval(pushBoulder,100); });
pushBtn.addEventListener("touchend", e=>{ e.preventDefault(); clearInterval(pushInterval); });

// Other buttons
resetAllBtn.addEventListener("click", resetAllProgress);
sacrificeSpeedBtn.addEventListener("click",()=>{
  if(level>=3){ level-=2; state.maxEndurance=BASE_ENDURANCE+level*ENDURANCE_PER_LEVEL; gameSpeed+=0.25; log("Sacrificed 2 levels: +0.25 Speed"); updateUI(); } else log("Need at least 3 levels.");
});
sacrificeGripBtn.addEventListener("click",()=>{
  if(level>=1 && state.gripStrength<100){ level--; state.gripStrength++; log("Sacrificed 1 level: +1% Grip"); updateUI(); } else log("Cannot improve grip.");
});
upgradeSandalsBtn.addEventListener("click",()=>{
  if(level>=1 && state.sandalsChance<100){ level--; state.sandalsChance++; log("Sacrificed 1 level: +1% Sandals"); updateUI(); } else log("Cannot upgrade sandals.");
});

// Cheat
document.addEventListener("keydown",e=>{
  if(e.key.toUpperCase()==="C"){
    const code = prompt("Enter cheat code:");
    if(code==="HADESRULE"){
      level=9999;
      state.maxEndurance=BASE_ENDURANCE+level*ENDURANCE_PER_LEVEL;
      state.endurance=state.maxEndurance;
      updateUI();
      log("Cheat: Level 9999!");
    } else log("Invalid cheat.");
  }
});

// ---- Intervals ----
setInterval(applyGravity, 200);
setInterval(checkSlip, 1000);
setInterval(godsSpeak, 3000);

loadGame();
updateUI();
log("The hill awaits your effort.");
});

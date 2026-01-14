// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCHcN4BUl0TrruEYKU-CiQU5xDLdRoiRpc",
  authDomain: "sisyphus-game.firebaseapp.com",
  projectId: "sisyphus-game",
  storageBucket: "sisyphus-game.firebasestorage.app",
  messagingSenderId: "607196471620",
  appId: "1:607196471620:web:6dee5d613b89874c3c7711"
};

// Initialize Firebase
let db = null;

try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  console.log("Firebase initialized successfully");
} catch (error) {
  console.error("Firebase initialization error:", error);
}

document.addEventListener("DOMContentLoaded", () => {

//// ---------------- CONSTANTS ----------------
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
const MAX_HEIGHT = 500;
const FAKE_ESCAPE_HEIGHT = 480;
const SAVE_KEY = "sisyphus_save_v1";

// Audio
const BASE_FREQUENCY = 200;
const FREQUENCY_SCALE = 0.5;
const MAX_FREQUENCY = 2000;

//// ---------------- GAME STATE ----------------
let gameSpeed = 1;
let runCount = 1;
let level = 1;
let xp = 0;
let playerUsername = null;
let personalBest = 0;

const state = {
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

//// ---------------- DOM ----------------
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

//// ---------------- BUTTON HANDLERS ----------------
resetAllBtn.addEventListener("click", () => {
  if (confirm("Reset all progress?")) {
    gameSpeed = 1;
    runCount = 1;
    level = 1;
    xp = 0;
    personalBest = 0;
    state.height = 0;
    state.endurance = BASE_ENDURANCE;
    state.maxEndurance = BASE_ENDURANCE;
    state.alive = true;
    state.recovering = false;
    state.gripStrength = 0;
    state.sandalsChance = 0;
    log("The gods smile upon your suffering. All progress erased.");
    updateUI();
  }
});

sacrificeSpeedBtn.addEventListener("click", () => {
  if (level >= 2) {
    level -= 2;
    gameSpeed *= 1.5;
    state.maxEndurance = BASE_ENDURANCE + level * ENDURANCE_PER_LEVEL;
    state.endurance = state.maxEndurance;
    log("You provoked the gods. The world spins faster.");
    updateUI();
  } else {
    log("You are not high enough level to provoke the gods.");
  }
});

sacrificeGripBtn.addEventListener("click", () => {
  if (level >= 1) {
    level -= 1;
    state.gripStrength += 10;
    state.maxEndurance = BASE_ENDURANCE + level * ENDURANCE_PER_LEVEL;
    state.endurance = state.maxEndurance;
    log("Your grip tightens. The stone will not slip.");
    updateUI();
  } else {
    log("You are not high enough level.");
  }
});

upgradeSandalsBtn.addEventListener("click", () => {
  if (level >= 1) {
    level -= 1;
    state.sandalsChance += 10;
    state.maxEndurance = BASE_ENDURANCE + level * ENDURANCE_PER_LEVEL;
    state.endurance = state.maxEndurance;
    log("Your will becomes stronger. You will not stumble.");
    updateUI();
  } else {
    log("You are not high enough level.");
  }
});

//// ---------------- USERNAME MODAL ----------------
const usernameModal = document.getElementById("username-modal");
const usernameInput = document.getElementById("username-input");
const usernameSubmitBtn = document.getElementById("username-submit-btn");

// Load username from localStorage or show modal
function loadOrPromptUsername() {
  console.log("loadOrPromptUsername called");
  const savedUsername = localStorage.getItem("sisyphus_username");
  console.log("Saved username:", savedUsername);
  if (savedUsername && savedUsername.trim()) {
    playerUsername = savedUsername;
    usernameModal.classList.add("hidden");
    initializeGame();
  } else {
    console.log("Showing username modal");
    usernameModal.classList.remove("hidden");
    usernameInput.focus();
  }
}

usernameSubmitBtn.addEventListener("click", () => {
  console.log("Begin button clicked");
  const name = usernameInput.value.trim();
  console.log("Username entered:", name);
  if (name) {
    playerUsername = name;
    localStorage.setItem("sisyphus_username", name);
    usernameModal.classList.add("hidden");
    console.log("Modal hidden, initializing game");
    initializeGame();
  } else {
    alert("Please enter a name!");
  }
});

usernameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    usernameSubmitBtn.click();
  }
});

//// ---------------- AUDIO ----------------
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let oscillator = null;
const gainNode = audioCtx.createGain();
gainNode.gain.value = 0.3;
gainNode.connect(audioCtx.destination);

function startAudio() {
  if (state.audioStarted) return;
  state.audioStarted = true;
  audioCtx.resume();
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
  state.audioStarted = false;
}

function updateTone() {
  if (!oscillator) return;
  oscillator.frequency.value = Math.min(
    MAX_FREQUENCY,
    BASE_FREQUENCY + state.height * FREQUENCY_SCALE
  );
}

//// ---------------- LEADERBOARD ----------------
const leaderboardEl = document.getElementById("leaderboard");

async function submitScore() {
  if (!db || !playerUsername) return;
  
  try {
    const playerRef = db.collection("leaderboard").doc(playerUsername);
    const playerDoc = await playerRef.get();
    
    const currentBest = playerDoc.exists ? playerDoc.data().height : 0;
    
    if (state.height > currentBest) {
      await playerRef.set({
        username: playerUsername,
        height: state.height,
        level: level,
        timestamp: new Date().toISOString()
      });
      personalBest = state.height;
      log("🏔️ New personal record! Submitted to the Hall of Suffering.");
    }
  } catch (error) {
    console.error("Error submitting score:", error);
  }
}

async function loadLeaderboard() {
  if (!db) {
    leaderboardEl.innerHTML = "<p>Firebase not configured</p>";
    return;
  }
  
  try {
    const snapshot = await db.collection("leaderboard")
      .orderBy("height", "desc")
      .limit(10)
      .get();
    
    if (snapshot.empty) {
      leaderboardEl.innerHTML = "<p>No scores yet. Be the first!</p>";
      return;
    }
    
    let html = "";
    snapshot.forEach((docSnap, index) => {
      const data = docSnap.data();
      const isCurrentPlayer = data.username === playerUsername ? "current-player" : "";
      html += `
        <div class="leaderboard-entry ${isCurrentPlayer}">
          <span class="leaderboard-rank">#${index + 1}</span>
          <span class="leaderboard-name">${data.username}</span>
          <span class="leaderboard-stats">Height: ${Math.round(data.height)} ft | Level: ${data.level}</span>
        </div>
      `;
    });
    leaderboardEl.innerHTML = html;
  } catch (error) {
    console.error("Error loading leaderboard:", error);
    leaderboardEl.innerHTML = "<p>Error loading leaderboard</p>";
  }
}

// Real-time leaderboard listener
function setupLeaderboardListener() {
  if (!db) {
    console.warn("Firebase not initialized, skipping leaderboard");
    return;
  }
  
  try {
    db.collection("leaderboard")
      .orderBy("height", "desc")
      .limit(10)
      .onSnapshot((snapshot) => {
        loadLeaderboard();
      }, (error) => {
        console.error("Leaderboard listener error:", error);
        leaderboardEl.innerHTML = "<p style='color: #999;'>Leaderboard unavailable</p>";
      });
  } catch (error) {
    console.error("Setup leaderboard listener error:", error);
  }
}

//// ---------------- GAME INITIALIZATION ----------------
function initializeGame() {
  setupLeaderboardListener();
  updateUI();
  log("The hill awaits.");
}

// Call on startup - MOVED INSIDE DOMContentLoaded
// loadOrPromptUsername();

//// ---------------- UTILITY ----------------
function log(msg) {
  const d = document.createElement("div");
  d.textContent = msg;
  logEl.prepend(d);
}

function xpToNextLevel() {
  return Math.floor(XP_LEVEL_BASE * Math.pow(XP_LEVEL_SCALE, level - 1));
}

function updateSisyphus() {
  const maxX = hillContainer.clientWidth - sisyphusImg.clientWidth;
  sisyphusImg.style.left = `${(state.height / MAX_HEIGHT) * maxX}px`;
}

function updateUI() {
  heightEl.textContent = Math.floor(state.height) + " ft";
  enduranceEl.textContent = Math.floor(state.endurance);
  runEl.textContent = runCount;
  levelEl.textContent = level;
  xpTextEl.textContent = `${Math.floor(xp)} / ${xpToNextLevel()}`;
  gameSpeedEl.textContent = gameSpeed.toFixed(2);
  gripStrengthEl.textContent = `${state.gripStrength}%`;
  sandalsChanceEl.textContent = `${state.sandalsChance}%`;
  updateSisyphus();
}

  
//// ---------------- PUSH ----------------
function pushBoulder() {
  if (!state.alive || state.recovering || state.forcedFall) return;

  startAudio();

  state.height += BASE_PUSH * gameSpeed;
  state.height = Math.min(state.height, MAX_HEIGHT - 1);

  if (Math.random() * 100 >= state.sandalsChance) {
    state.endurance -= ENDURANCE_DRAIN * gameSpeed;
  }

  state.hasLeftBottom = true;
  state.fallTime = 0;

  xp += XP_PER_HEIGHT;
  applyLevelUps();

  if (state.height >= FAKE_ESCAPE_HEIGHT && !state.fakeEscapeTriggered) {
    triggerFakeEscape();
  }

  if (state.endurance <= 0) {
    state.endurance = 0;
    state.alive = false;
    log("Your strength fails.");
    
    // Check if this is a personal best
    if (state.height > personalBest) {
      personalBest = state.height;
      log("New personal record!");
      submitScore();
    }
  }

  updateTone();
  updateUI();
}

//// ---------------- HOLD TO PUSH ----------------
let pushInterval = null;

pushBtn.addEventListener("mousedown", () => {
  if (!state.alive || state.recovering) return;
  pushBoulder();
  pushInterval = setInterval(pushBoulder, 100 / gameSpeed);
});

["mouseup", "mouseleave"].forEach(evt =>
  pushBtn.addEventListener(evt, () => clearInterval(pushInterval))
);

pushBtn.addEventListener("touchstart", e => {
  e.preventDefault();
  if (!state.alive || state.recovering) return;
  pushBoulder();
  pushInterval = setInterval(pushBoulder, 100 / gameSpeed);
});

pushBtn.addEventListener("touchend", () => clearInterval(pushInterval));




  /// -------cheat code--------
  document.addEventListener("keydown", (e) => {
  if (e.repeat) return; // prevent spam
  if (e.key.toLowerCase() !== "c") return;

  const code = prompt("Enter cheat code:");
  if (!code) return;

  if (code === "HADESRULE") {
    level = 9999;
    state.maxEndurance = BASE_ENDURANCE + level * ENDURANCE_PER_LEVEL;
    state.endurance = state.maxEndurance;
    gameSpeed = 5;

    state.alive = true;
    state.recovering = false;

    log("The gods recoil.");
    log("Cheat accepted: HADESRULE");

    updateUI();
  } else {
    log("The gods laugh at your failed incantation.");
  }
});

//// ---------------- GRAVITY ----------------
function applyGravity() {
  if (state.height <= 0) return;

  state.fallTime += 0.2 * gameSpeed;
  state.height -= (BASE_GRAVITY + state.height * GRAVITY_HEIGHT_SCALE) * (1 + state.fallTime * 0.05);

  if (state.height <= 0) {
    state.height = 0;
    stopAudio();
    beginRecovery();
  }

  updateTone();
  updateUI();
}

//// ---------------- RECOVERY ----------------
function beginRecovery() {
  if (state.recovering) return;
  state.recovering = true;
  state.alive = false;

  const regen = setInterval(() => {
    // Regenerate faster if at the bottom
    const regenRate = (state.height === 0) ? 0.12 : 0.05;
    state.endurance += state.maxEndurance * regenRate;
    if (state.endurance >= state.maxEndurance) {
      state.endurance = state.maxEndurance;
      state.recovering = false;
      state.alive = true;
      pushBtn.disabled = false;
      runCount++;
      clearInterval(regen);
      log("The gods demand another ascent.");
    }
    updateUI();
  }, 500);
}

//// ---------------- LEVELING ----------------
function applyLevelUps() {
  while (xp >= xpToNextLevel()) {
    xp -= xpToNextLevel();
    level++;
    state.maxEndurance = BASE_ENDURANCE + level * ENDURANCE_PER_LEVEL;
    state.endurance = state.maxEndurance;
    log(`Level ${level}`);
  }
}

//// ---------------- FAKE ESCAPE ----------------
function triggerFakeEscape() {
  state.fakeEscapeTriggered = true;
  state.forcedFall = true;
  state.endurance = 0;
  stopAudio();
  log("You almost believed.");
}

//// ---------------- INTERVALS ----------------
setInterval(applyGravity, 100);
setInterval(updateUI, 250);

// Initialize the game now that DOM is loaded
loadOrPromptUsername();

});

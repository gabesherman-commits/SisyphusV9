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
const XP_LEVEL_BASE = 25;
const XP_LEVEL_SCALE = 1.3;
const MAX_HEIGHT = 500;
const FAKE_ESCAPE_HEIGHT = 480;
const SAVE_KEY = "sisyphus_save_v1";
const DIVINE_PUNISHMENT_CHANCE = 0.002; // 0.2% chance per push
const RANDOM_EVENT_CHANCE = 0.015; // 1.5% chance per push for a random event

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
  sandalsChance: 0,
  hasLeftBottom: false,
  fallTime: 0,
  forcedFall: false,
  fakeEscapeTriggered: false,
  audioStarted: false,
  // Random event states
  divineBlessingPushes: 0,        // Pushes remaining with no endurance drain
  curseMomentumPushes: 0,         // Auto-pushes remaining
  slipperyBoulderPushes: 0,       // Pushes with 3x drain remaining
  gracePeriodActive: false,       // Recovery boost active
  strengthSurgePushes: 0,         // Pushes with 2x height remaining
  strengthSurgeMultiplier: 1      // Current push multiplier
};

//// ---------------- COSMETICS ----------------
const COSMETICS = {
  characters: [
    { id: "sisyphus-classic", name: "Sisyphus", unlockCondition: () => true, image: "assets/Sisyphus.png" },
    { id: "sisyphus-warrior", name: "Warrior", unlockCondition: () => level >= 5, image: "assets/Sisyphus-warrior.png" },
    { id: "sisyphus-spectral", name: "Spectral Form", unlockCondition: () => personalBest >= 200, image: "assets/Sisyphus-spectral.png" },
    { id: "sisyphus-titan", name: "Titan", unlockCondition: () => level >= 15, image: "assets/Sisyphus-titan.png" },
    { id: "sisyphus-cursed", name: "Cursed", unlockCondition: () => personalBest >= 400, image: "assets/Sisyphus-cursed.png" },
    { id: "sisyphus-coquette", name: "Coquette", unlockCondition: () => cosmetics.unlockedCharacters.includes("sisyphus-coquette"), image: "assets/Sisyphus-coquette.png" }
  ]
};

let cosmetics = {
  activeCharacter: "sisyphus-classic",
  unlockedCharacters: ["sisyphus-classic"],
  unlockedBoulders: ["boulder-stone"]
};

function loadCosmetics() {
  const saved = localStorage.getItem("sisyphus_cosmetics");
  if (saved) {
    cosmetics = JSON.parse(saved);
  }
}

function saveCosmetics() {
  localStorage.setItem("sisyphus_cosmetics", JSON.stringify(cosmetics));
}

function updateUnlockedCosmetics() {
  // Check character unlocks
  COSMETICS.characters.forEach(char => {
    if (char.unlockCondition() && !cosmetics.unlockedCharacters.includes(char.id)) {
      cosmetics.unlockedCharacters.push(char.id);
      log(`✨ Unlocked character: ${char.name}`);
    }
  });
  

  saveCosmetics();
}

function applyCosmetics() {
  const character = COSMETICS.characters.find(c => c.id === cosmetics.activeCharacter);
  
  if (character) {
    sisyphusImg.src = character.image;
  }
}

//// ---------------- DOM ----------------
const heightEl = document.getElementById("height");
const enduranceEl = document.getElementById("endurance");
const runEl = document.getElementById("run");
const levelEl = document.getElementById("level");
const xpTextEl = document.getElementById("xp-text");
const gameSpeedEl = document.getElementById("game-speed");

const sandalsChanceEl = document.getElementById("sandals-chance");
const godsEl = document.getElementById("gods-comment");
const logEl = document.getElementById("log");

const pushBtn = document.getElementById("pushBtn");
const resetAllBtn = document.getElementById("resetAllBtn");
const sacrificeSpeedBtn = document.getElementById("sacrificeSpeedBtn");

const upgradeSandalsBtn = document.getElementById("upgradeSandalsBtn");
const cosmeticsBtn = document.getElementById("cosmeticsBtn");

const hillContainer = document.getElementById("hill-container");
const sisyphusImg = document.getElementById("sisyphus-img");

const personalBestMarker = document.createElement("div");
personalBestMarker.id = "personal-best-marker";
personalBestMarker.title = "Personal Best";
hillContainer.appendChild(personalBestMarker);

// Audio control elements
const volumeSlider = document.getElementById("volumeSlider");
if (volumeSlider) {
  volumeSlider.addEventListener("input", (e) => {
    gainNode.gain.value = parseFloat(e.target.value);
  });
}

//// ---------------- BUTTON HANDLERS ----------------
resetAllBtn.addEventListener("click", () => {
  if (confirm("Reset all progress? Beg forgiveness from the gods?")) {
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
    state.sandalsChance = 0;
    const resetMessages = [
      "The gods smile upon your submission. All is forgotten. All must be repeated.",
      "You stand at the base once more. Older. Wearier. Wiser? Perhaps not.",
      "The cycle resets. Sisyphus begins again. Will this time be different?"
    ];
    const msg = resetMessages[Math.floor(Math.random() * resetMessages.length)];
    log(msg);
    updateUI();
  }
});

sacrificeSpeedBtn.addEventListener("click", () => {
  if (level >= 2) {
    level -= 2;
    gameSpeed += 0.25;
    const messages = [
      "You have provoked the gods! They accelerate your eternal torment.",
      "The gods mock your sacrifice. Time itself bends against you.",
      "Your defiance amuses them. The pace of eternity quickens."
    ];
    const msg = messages[Math.floor(Math.random() * messages.length)];
    log(msg);
    updateUI();
  } else {
    log("You are not high enough level to provoke the gods.");
  }
});

// sacrificeGripBtn has been removed — grip strength is no longer an upgrade

upgradeSandalsBtn.addEventListener("click", () => {
  if (state.sandalsChance >= 80) {
    log("Your cunning has reached its peak. Even the gods cannot grant more.");
  } else if (level >= 1) {
    level -= 1;
    state.sandalsChance += 10;
    state.maxEndurance = BASE_ENDURANCE + level * ENDURANCE_PER_LEVEL;
    state.endurance = state.maxEndurance;
    const willMessages = [
      "Your will becomes iron. The boulder cannot weaken you. Not yet.",
      "You are trickery incarnate. The stone's weight no longer binds you.",
      "By cunning and wit, you preserve yourself. The gods' tools grow dull."
    ];
    const msg = willMessages[Math.floor(Math.random() * willMessages.length)];
    log(msg);
    updateUI();
  } else {
    log("You are not high enough level.");
  }
});

//// ---------- COSMETICS UI ----------
const cosmeticsModal = document.getElementById("cosmetics-modal");

cosmeticsBtn.addEventListener("click", () => {
  cosmeticsModal.classList.remove("hidden");
  renderCosmeticsUI();
});

// Close modal when clicking outside the modal content
cosmeticsModal.addEventListener("click", (e) => {
  if (e.target === cosmeticsModal) {
    cosmeticsModal.classList.add("hidden");
  }
});

// Close modal with escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !cosmeticsModal.classList.contains("hidden")) {
    cosmeticsModal.classList.add("hidden");
  }
});

function renderCosmeticsUI() {
  const charactersGrid = document.getElementById("characters-grid");
  const bouldersGrid = document.getElementById("boulders-grid");
  
  charactersGrid.innerHTML = "";
  if (bouldersGrid) {
    bouldersGrid.parentElement.style.display = "none";
  }
  
  // Render characters
  COSMETICS.characters.forEach(char => {
    const isUnlocked = cosmetics.unlockedCharacters.includes(char.id);
    const isActive = cosmetics.activeCharacter === char.id;
    
    const div = document.createElement("div");
    div.className = `cosmetic-item ${!isUnlocked ? "locked" : ""} ${isActive ? "active" : ""}`;
    
    const unlockMsg = isUnlocked 
      ? (isActive ? "✓ Active" : "Unlocked") 
      : "Locked";
    
    div.innerHTML = `
      <div class="cosmetic-name">${char.name}</div>
      <div class="cosmetic-status">${unlockMsg}</div>
    `;
    
    if (isUnlocked) {
      div.style.cursor = "pointer";
      div.addEventListener("click", () => {
        cosmetics.activeCharacter = char.id;
        saveCosmetics();
        applyCosmetics();
        renderCosmeticsUI();
      });
    }
    
    charactersGrid.appendChild(div);
  });
}

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
gainNode.gain.value = 0.5;
gainNode.connect(audioCtx.destination);

// Sound effects
let soundEffectVolume = 0.7;

async function loadSoundEffect(name, path) {
  // Sounds are generated programmatically, so this is a no-op
  console.log(`Sound '${name}' ready (programmatic)`);
}

function playSoundEffect(name) {
  try {
    // Ensure audio context is resumed
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    
    if (name === "good") {
      playGoodSound();
    } else if (name === "bad") {
      playBadSound();
    }
  } catch (error) {
    console.error(`Error playing sound effect ${name}:`, error);
  }
}

function playGoodSound() {
  // Pleasant ascending tone: happy chime
  const now = audioCtx.currentTime;
  
  // Create three oscillators for a chord-like effect
  const frequencies = [523.25, 659.25, 783.99]; // C, E, G notes
  
  frequencies.forEach((freq, index) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = "sine";
    osc.frequency.value = freq;
    
    // Stagger the notes slightly for a nice effect
    gain.gain.setValueAtTime(soundEffectVolume * 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3 - index * 0.05);
    
    osc.connect(gain);
    gain.connect(gainNode);
    
    osc.start(now + index * 0.05);
    osc.stop(now + 0.3);
  });
}

function playBadSound() {
  // Unpleasant descending tone: error buzz
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = "sawtooth";  // Harsh sound
  
  // Quick descending pitch
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(150, now + 0.2);
  
  // Quick fade out
  gain.gain.setValueAtTime(soundEffectVolume * 0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
  
  osc.connect(gain);
  gain.connect(gainNode);
  
  osc.start(now);
  osc.stop(now + 0.2);
}

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
  loadCosmetics();
  loadSoundEffect("good", "assets/ahh.ogg");
  loadSoundEffect("bad", "assets/explode.ogg");
  applyCosmetics();
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

  // Update personal best marker (vertical line at personal best distance)
  const leftPos = (personalBest / MAX_HEIGHT) * maxX;
  const frontPos = leftPos + sisyphusImg.clientWidth; // use the front of the hitbox
  const markerX = Math.max(0, Math.min(hillContainer.clientWidth, frontPos));
  personalBestMarker.style.left = `${markerX}px`;
  personalBestMarker.style.display = personalBest > 0 ? "block" : "none";
}

function updateUI() {
  heightEl.textContent = Math.floor(state.height) + " ft";
  enduranceEl.textContent = Math.floor(state.endurance);
  runEl.textContent = runCount;
  levelEl.textContent = level;
  xpTextEl.textContent = `${Math.floor(xp)} / ${xpToNextLevel()}`;
  gameSpeedEl.textContent = gameSpeed.toFixed(2);
  // gripStrength removed from UI
  sandalsChanceEl.textContent = `${state.sandalsChance}%`;
  updateSisyphus();
}

  
//// ---------------- PUSH ----------------
function pushBoulder() {
  if (!state.alive || state.recovering || state.forcedFall) return;

  startAudio();

  // Apply strength surge multiplier
  const pushPower = BASE_PUSH * gameSpeed * state.strengthSurgeMultiplier;
  state.height += pushPower;
  state.height = Math.min(state.height, MAX_HEIGHT - 1);

  // Handle endurance drain
  let drainAmount = ENDURANCE_DRAIN * gameSpeed;
  
  // Divine blessing: no drain
  if (state.divineBlessingPushes > 0) {
    drainAmount = 0;
    state.divineBlessingPushes--;
  }
  // Slippery boulder: 3x drain
  else if (state.slipperyBoulderPushes > 0) {
    drainAmount *= 3;
    state.slipperyBoulderPushes--;
  }
  // Normal case: endurance save chance (sandals)
  else if (Math.random() * 100 >= state.sandalsChance) {
    state.endurance -= drainAmount;
  } else {
    // Saved by sandals
  }

  // Decrease strength surge counter
  if (state.strengthSurgePushes > 0) {
    state.strengthSurgePushes--;
  } else {
    state.strengthSurgeMultiplier = 1;
  }

  state.hasLeftBottom = true;
  state.fallTime = 0;

  // Check for divine punishment
  if (Math.random() < DIVINE_PUNISHMENT_CHANCE && state.height > 0) {
    state.height = 0;
    log("The gods laugh at your hubris and cast you down!");
    updateUI();
    updateTone();
    return;
  }

  // Check for random positive/negative event
  if (Math.random() < RANDOM_EVENT_CHANCE) {
    triggerRandomEvent();
  }

  xp += XP_PER_HEIGHT;
  applyLevelUps();
  updateUnlockedCosmetics();

  // Milestone messages for narrative progression
  if (state.height >= 100 && state.height < 101) {
    log("100 feet. You are making progress. Or are the gods merely toying with you?");
  } else if (state.height >= 250 && state.height < 251) {
    log("250 feet. Halfway there. The air grows thin. Your resolve grows thinner.");
  } else if (state.height >= 400 && state.height < 401) {
    log("400 feet. So close. So very close. Can you taste freedom?");
  }

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
      updateUnlockedCosmetics();
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
  } else if (code === "coquette") {
    if (!cosmetics.unlockedCharacters.includes("sisyphus-coquette")) {
      cosmetics.unlockedCharacters.push("sisyphus-coquette");
    }
    cosmetics.activeCharacter = "sisyphus-coquette";
    saveCosmetics();
    applyCosmetics();
    log("✨ A mysterious beauty has appeared...");
    if (!cosmeticsModal.classList.contains("hidden")) {
      renderCosmeticsUI();
    }
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

  const recoveryMessages = [
    "The gods demand another ascent.",
    "The boulder awaits. Again.",
    "Your strength returns. The cycle continues.",
    "You gather yourself for another push.",
    "Rest is fleeting. The hill calls."
  ];

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
      const msg = recoveryMessages[Math.floor(Math.random() * recoveryMessages.length)];
      log(msg);
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
  const escapeMessages = [
    "You almost believed.",
    "Freedom was never yours.",
    "The summit recedes. It always does.",
    "So close. Yet so far.",
    "Hope is the cruelest punishment of all."
  ];
  const msg = escapeMessages[Math.floor(Math.random() * escapeMessages.length)];
  log(msg);
}

//// ---------------- RANDOM EVENTS ----------------
function triggerRandomEvent() {
  const events = [
    { name: "Divine Blessing", fn: triggerDivineBlessing, weight: 1 },
    { name: "Curse of Momentum", fn: triggerCurseMomentum, weight: 1 },
    { name: "Slippery Boulder", fn: triggerSlipperyBoulder, weight: 1 },
    { name: "Grace Period", fn: triggerGracePeriod, weight: 1 },
    { name: "Strength Surge", fn: triggerStrengthSurge, weight: 1 },
    { name: "Boulder Malfunction", fn: triggerBoulderMalfunction, weight: 1 }
  ];
  
  const randomEvent = events[Math.floor(Math.random() * events.length)];
  randomEvent.fn();
}

function triggerDivineBlessing() {
  state.divineBlessingPushes = 5;
  playSoundEffect("good");
  const blessingMessages = [
    "✨ The gods smile upon you! Your next 5 pushes drain no endurance!",
    "✨ A moment of mercy. The boulder lightens for 5 pushes.",
    "✨ Divine favor! The weight lifts from your shoulders—briefly."
  ];
  const msg = blessingMessages[Math.floor(Math.random() * blessingMessages.length)];
  log(msg);
}

function triggerCurseMomentum() {
  state.curseMomentumPushes = 3;
  playSoundEffect("bad");
  const curseMessages = [
    "⚡ The boulder seizes control! 3 automated pushes ensue!",
    "⚡ The gods mock your effort. The boulder moves itself.",
    "⚡ A curse of momentum! The stone rolls of its own will."
  ];
  const msg = curseMessages[Math.floor(Math.random() * curseMessages.length)];
  log(msg);
  // Auto-push after a short delay
  setTimeout(() => autoPushBoulder(), 200);
}

function autoPushBoulder() {
  if (state.curseMomentumPushes > 0 && state.alive) {
    state.height += BASE_PUSH * gameSpeed * 0.5; // Half strength auto-push
    state.height = Math.min(state.height, MAX_HEIGHT - 1);
    state.endurance -= ENDURANCE_DRAIN * gameSpeed * 0.5; // Half drain
    state.curseMomentumPushes--;
    
    if (state.curseMomentumPushes > 0) {
      setTimeout(() => autoPushBoulder(), 200);
    }
    
    updateUI();
    updateTone();
  }
}

function triggerSlipperyBoulder() {
  state.slipperyBoulderPushes = 3;
  playSoundEffect("bad");
  const slipperyMessages = [
    "🌊 The boulder becomes treacherous! The next 3 pushes drain 3x endurance!",
    "🌊 Cursed moisture! Your grip weakens. 3x drain for 3 pushes.",
    "🌊 The boulder is slick with divine oil. Push harder! (3x cost)"
  ];
  const msg = slipperyMessages[Math.floor(Math.random() * slipperyMessages.length)];
  log(msg);
}

function triggerGracePeriod() {
  const recovered = Math.floor(state.maxEndurance * 0.5);
  state.endurance = Math.min(state.endurance + recovered, state.maxEndurance);
  playSoundEffect("good");
  const graceMessages = [
    "🙏 Grace descends. The gods restore your strength (" + state.endurance + "/" + state.maxEndurance + ")",
    "🙏 A brief respite. Strength returns to weary limbs (" + state.endurance + "/" + state.maxEndurance + ")",
    "🙏 The gods take pity. For now. (" + state.endurance + "/" + state.maxEndurance + ")"
  ];
  const msg = graceMessages[Math.floor(Math.random() * graceMessages.length)];
  log(msg);
  updateUI();
}

function triggerStrengthSurge() {
  state.strengthSurgePushes = 5;
  state.strengthSurgeMultiplier = 2;
  playSoundEffect("good");
  const surgeMessages = [
    "💪 A surge of primal strength! Your next 5 pushes are 2x stronger!",
    "💪 Godly vigor flows through you. 5 enhanced pushes await.",
    "💪 Herculean power! 5 pushes worth double the effort."
  ];
  const msg = surgeMessages[Math.floor(Math.random() * surgeMessages.length)];
  log(msg);
}

function triggerBoulderMalfunction() {
  const heightLoss = Math.floor(state.height * (0.1 + Math.random() * 0.2));
  state.height -= heightLoss;
  state.height = Math.max(state.height, 0);
  playSoundEffect("bad");
  const malfunctionMessages = [
    "💥 The boulder crumbles! Lost " + heightLoss + "ft of progress!",
    "💥 Catastrophic failure! " + heightLoss + "ft vanishes in an instant!",
    "💥 The gods mock your labor. " + heightLoss + "ft erased. Start again."
  ];
  const msg = malfunctionMessages[Math.floor(Math.random() * malfunctionMessages.length)];
  log(msg);
  updateUI();
  updateTone();
}

//// ---------------- INTERVALS ----------------
setInterval(applyGravity, 100);
setInterval(updateUI, 250);

// Initialize the game now that DOM is loaded
loadOrPromptUsername();

});

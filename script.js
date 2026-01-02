// =====================
// DATA (your list)
// =====================
const WORDS = [
  { jp: "看见", romaji: "see", seen: 0 },
  { jp: "和我", romaji: "with me", seen: 0 },
  { jp: "都是", romaji: "are all", seen: 0 },
  { jp: "朋友", romaji: "friends", seen: 0 },
  { jp: "出去", romaji: "go out", seen: 0 },
  { jp: "我就", romaji: "I will", seen: 0 }
];

// =====================
// CONFIG
// =====================
const TOTAL_ROUNDS = 20;
const STEPS = 20; // ✅ finish line steps

// Falling: base px/sec + per-seen increment (capped)
const BASE_FALL_SPEED = 30;     // slower (kid-friendly)
const PER_SEEN_SPEED = 30;       // repeats get faster
const MAX_FALL_SPEED = 580;      // cap

// Impact threshold (px from top in highway area)
let IMPACT_Y = 240;

// =====================
// STATE
// =====================
let modeJP = true;          // true: JP falls -> choose romaji
let round = 1;
let score = 0;

let currentWord = null;
let y = 10;
let fallSpeed = BASE_FALL_SPEED;

let running = false;
let animId = null;
let lastT = 0;

// Racing positions (steps)
let playerPos = 0;
let rivalPos = 0;

// Wrong penalty only once per round
let wrongPenaltyUsed = false;

// =====================
// ELEMENTS
// =====================
const modeToggleEl = document.getElementById("modeToggle");
const roundInfoEl = document.getElementById("roundInfo");
const scoreInfoEl = document.getElementById("scoreInfo");

const wordEl = document.getElementById("fallingWord");
const answersEl = document.getElementById("answers");

const overlayEl = document.getElementById("overlay");
const panelEl = document.getElementById("panel");

const playerTokenEl = document.getElementById("playerToken");
const rivalTokenEl = document.getElementById("rivalToken");

// =====================
// HELPERS
// =====================
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function computeImpactY() {
  const highway = document.querySelector(".highway");
  const h = highway.getBoundingClientRect().height;
  const wh = wordEl.getBoundingClientRect().height || 60;
  IMPACT_Y = (h - 70) - (wh * 0.5);
}

function setTokenPosition(tokenEl, stepPos) {
  const lineEl = tokenEl.parentElement;
  const rect = lineEl.getBoundingClientRect();
  const tokenRect = tokenEl.getBoundingClientRect();

  const maxLeft = rect.width - tokenRect.width;

  // 🔁 INVERT DIRECTION: 0 = right, STEPS = left
  const frac = stepPos / STEPS;
  const leftPx = clamp(maxLeft - (frac * maxLeft), 0, maxLeft);

  tokenEl.style.left = `${leftPx}px`;
}


function updateTopUI() {
  roundInfoEl.textContent = `Round ${round} / ${TOTAL_ROUNDS}`;
  scoreInfoEl.textContent = `Score: ${score}`;
  modeToggleEl.textContent = modeJP ? "JP → Romaji" : "Romaji → JP";
}

function updateRaceUI() {
  setTokenPosition(playerTokenEl, playerPos);
  setTokenPosition(rivalTokenEl, rivalPos);
}

// =====================
// ENDING / WIN CHECKS
// =====================
function declareWinnerByFinish(who) {
  endGame(who === "player" ? "player_finish" : "rival_finish");
}

function declareWinnerByDistance() {
  endGame("distance");
}

// =====================
// GAME FLOW
// =====================
function resetGame() {
  round = 1;
  score = 0;
  playerPos = 0;
  rivalPos = 0;
  currentWord = null;

  WORDS.forEach(w => w.seen = 0);

  overlayEl.style.display = "none";
  running = true;
  lastT = 0;

  computeImpactY();
  updateTopUI();
  updateRaceUI();
  spawnRound();
}

function pickNextWord() {
  let next = WORDS[Math.floor(Math.random() * WORDS.length)];
  if (currentWord && WORDS.length > 1) {
    let guard = 0;
    while (next === currentWord && guard < 20) {
      next = WORDS[Math.floor(Math.random() * WORDS.length)];
      guard++;
    }
  }
  return next;
}

function spawnRound() {
  if (!running) return;

  // If we already finished all rounds (safety)
  if (round > TOTAL_ROUNDS) {
    declareWinnerByDistance();
    return;
  }

  wrongPenaltyUsed = false;

  currentWord = pickNextWord();
  currentWord.seen += 1; // repeats speed up regardless of outcome

  fallSpeed = clamp(
    BASE_FALL_SPEED + (currentWord.seen - 1) * PER_SEEN_SPEED,
    BASE_FALL_SPEED,
    MAX_FALL_SPEED
  );

  y = 10;
  wordEl.style.top = `${y}px`;
  wordEl.classList.remove("pop");
  wordEl.textContent = modeJP ? currentWord.jp : currentWord.romaji;

  buildChoices3();
  updateTopUI();

  cancelAnimationFrame(animId);
  lastT = 0;
  animId = requestAnimationFrame(tick);
}

function buildChoices3() {
  answersEl.innerHTML = "";

  const pool = WORDS.filter(w => w !== currentWord);
  const shuffledPool = shuffle(pool);

  const wrong1 = shuffledPool[0] || currentWord;
  const wrong2 = shuffledPool[1] || currentWord;

  const choices = shuffle([currentWord, wrong1, wrong2]);

  choices.forEach(w => {
    const btn = document.createElement("button");
    btn.className = "answerBtn";
    btn.textContent = modeJP ? w.romaji : w.jp;
    btn.addEventListener("click", () => handleChoice(w, btn), { passive: true });
    answersEl.appendChild(btn);
  });
}

// ---------- Round-ending helpers ----------
function endRound({ rivalMoves }) {
  // Stop falling immediately
  cancelAnimationFrame(animId);

  // Rival movement is conditional now
  if (rivalMoves) {
    rivalPos = clamp(rivalPos + 1, 0, STEPS);
  }

  updateRaceUI();

  // Check finish-line win conditions immediately
  if (playerPos >= STEPS) {
    declareWinnerByFinish("player");
    return;
  }
  if (rivalPos >= STEPS) {
    declareWinnerByFinish("rival");
    return;
  }

  // Advance rounds
  round += 1;

  if (round > TOTAL_ROUNDS) {
    // Nobody finished by round 20 -> distance winner
    declareWinnerByDistance();
    return;
  }

  // Start next round
  lastT = 0;
  animId = requestAnimationFrame(tick);
  spawnRound();
}

function handleChoice(chosenWord, btn) {
  if (!running) return;

  if (chosenWord === currentWord) {
    // ✅ Correct: player +2, round ends, rival does NOT move
    score += 1;
    playerPos = clamp(playerPos + 2, 0, STEPS);

    btn.classList.add("correct");
    wordEl.classList.add("pop");

    // End round shortly after pop for nice feel
    running = false;
    setTimeout(() => {
      running = true;
      endRound({ rivalMoves: false });
    }, 200);

    updateTopUI();
    updateRaceUI();
    return;
  }

  // ❌ Wrong: player -1 only once per round; rival +1 only when that penalty happens
  btn.classList.add("wrong");

  if (!wrongPenaltyUsed) {
    wrongPenaltyUsed = true;

    playerPos = clamp(playerPos - 1, 0, STEPS);
    rivalPos = clamp(rivalPos + 1, 0, STEPS); // ✅ rival moves on mistake

    updateRaceUI();

    // Check if rival reached finish due to this mistake
    if (rivalPos >= STEPS) {
      declareWinnerByFinish("rival");
      return;
    }
  }
}

// Miss: ends round; rival moves +1; player no penalty (kid-friendly default)
function miss() {
  if (!running) return;

  running = false;
  setTimeout(() => {
    running = true;
    endRound({ rivalMoves: true });
  }, 120);
}

// =====================
// ANIMATION LOOP
// =====================
function tick(t) {
  if (!running) return;

  if (!lastT) lastT = t;
  const dt = (t - lastT) / 1000;
  lastT = t;

  y += fallSpeed * dt;
  wordEl.style.top = `${y}px`;

  if (y >= IMPACT_Y) {
    miss();
    return;
  }

  animId = requestAnimationFrame(tick);
}

// =====================
// END SCREEN
// =====================
function endGame(reason) {
  running = false;
  cancelAnimationFrame(animId);

  let headline = "🏁 Race Complete";
  let outcome = "";

  if (reason === "player_finish") {
    outcome = "You win! 🎉 (You reached the finish line first)";
  } else if (reason === "rival_finish") {
    outcome = "Rival wins! 🙂 (Rival reached the finish line first)";
  } else {
    // distance winner after round 20
    if (playerPos > rivalPos) outcome = "You win! 🎉 (Closer to finish after 20 rounds)";
    else if (playerPos < rivalPos) outcome = "Rival wins! 🙂 (Closer to finish after 20 rounds)";
    else outcome = "It’s a tie! 🤝 (Same distance after 20 rounds)";
  }

  overlayEl.style.display = "flex";
  panelEl.innerHTML = `
    <h2>${headline}</h2>
    <p><strong>${outcome}</strong></p>
    <p>Score: <strong>${score}</strong> / ${TOTAL_ROUNDS}</p>
    <p>You: ${playerPos} / ${STEPS} steps &nbsp; | &nbsp; Rival: ${rivalPos} / ${STEPS} steps</p>
    <button id="playAgain">Play Again</button>
  `;

  document.getElementById("playAgain").onclick = resetGame;
}

// =====================
// EVENTS
// =====================
modeToggleEl.addEventListener("click", () => {
  modeJP = !modeJP;
  resetGame(); // reset immediately on switch
});

window.addEventListener("resize", () => {
  computeImpactY();
  updateRaceUI();
});

// init
document.documentElement.style.setProperty("--steps", String(STEPS));
resetGame();

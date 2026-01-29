// =====================
// DATA (your list)
// =====================
const WORDS = [
  { jp: "看见", romaji: "see", seen: 0 },
  { jp: "和我", romaji: "with me", seen: 0 },
  { jp: "都是", romaji: "(we) are all", seen: 0 },
  { jp: "朋友", romaji: "friends", seen: 0 },
  { jp: "出去", romaji: "go out", seen: 0 },
  { jp: "我就", romaji: "I will", seen: 0 }
];

// =====================
// CONFIG
// =====================
const TOTAL_ROUNDS = 20;
const STEPS = 20;

// Falling: base px/sec + per-seen increment (capped)
const BASE_FALL_SPEED = 30;
const PER_SEEN_SPEED = 30;
const MAX_FALL_SPEED = 580;

let IMPACT_Y = 240;

// =====================
// STATE
// =====================
let modeJP = true;
let round = 1;
let score = 0;

let currentWord = null;
let y = 10;
let fallSpeed = BASE_FALL_SPEED;

let running = false;
let animId = null;
let lastT = 0;

let playerPos = 0;
let rivalPos = 0;

let wrongPenaltyUsed = false;

// --- New: car choice + practice ---
const CAR_CHOICES = ["🚗", "🚙", "🚕", "🏎️", "🚑", "🚚"];
let playerCarEmoji = "🚗";

let practiceMatched = new Set();
let firstPick = null; // { side: 'L'|'R', id, el }

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
const playerCarVisualEl = document.querySelector(".playerCarVisual");

// NEW overlay nodes (must exist in index.html)
const startOverlayEl = document.getElementById("startOverlay");
const startPanelEl = document.getElementById("startPanel");

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

  // 0 = right, STEPS = left
  const frac = stepPos / STEPS;
  const leftPx = clamp(maxLeft - (frac * maxLeft), 0, maxLeft);

  tokenEl.style.left = `${leftPx}px`;
}

function updateTopUI() {
  roundInfoEl.textContent = `Round ${round} / ${TOTAL_ROUNDS}`;
  scoreInfoEl.textContent = `Score: ${score}`;
  modeToggleEl.textContent = modeJP ? "JP → Romaji" : "Romaji → JP";
}

function applyCarChoice() {
  playerTokenEl.textContent = playerCarEmoji;
  if (playerCarVisualEl) playerCarVisualEl.textContent = playerCarEmoji;
}

function updateRaceUI() {
  applyCarChoice();
  setTokenPosition(playerTokenEl, playerPos);
  setTokenPosition(rivalTokenEl, rivalPos);
}

// =====================
// START FLOW: overlay steps
// =====================
function showStartOverlay() {
  // stop game
  running = false;
  cancelAnimationFrame(animId);

  // hide end overlay if any
  overlayEl.style.display = "none";

  if (!startOverlayEl || !startPanelEl) {
    // If user forgot to add start overlay in index.html, fall back to game
    resetGame();
    return;
  }

  startOverlayEl.style.display = "flex";
  renderCarSelectStep();
}

function renderCarSelectStep() {
  startPanelEl.innerHTML = `
    <h2 class="startTitle">Choose your car</h2>
    <p class="startSub">Pick a car you like, then we’ll do a quick matching warm-up.</p>

    <div class="carGrid" id="carGrid"></div>

    <div class="startActions">
      <button class="actionBtn" id="carNext" disabled>Next</button>
    </div>
  `;

  const grid = document.getElementById("carGrid");
  const nextBtn = document.getElementById("carNext");

  let selected = null;

  CAR_CHOICES.forEach(emoji => {
    const b = document.createElement("button");
    b.className = "carBtn";
    b.innerHTML = `<span class="emoji">${emoji}</span>`;
    b.addEventListener("click", () => {
      selected = emoji;
      playerCarEmoji = emoji;
      applyCarChoice();

      [...grid.querySelectorAll(".carBtn")].forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");

      nextBtn.disabled = false;
    });
    grid.appendChild(b);
  });

  nextBtn.addEventListener("click", () => {
    if (!selected) return;
    renderPracticeStep();
  });
}

function buildPracticePairs() {
  // LEFT = Chinese, RIGHT = English
  const base = WORDS.map((w, idx) => ({
    id: String(idx),
    left: w.jp,        // ✅ Chinese on left
    right: w.romaji    // ✅ English on right
  }));

  const leftShuf = shuffle(base.map(x => ({ id: x.id, text: x.left })));
  const rightShuf = shuffle(base.map(x => ({ id: x.id, text: x.right })));

  return { leftShuf, rightShuf, total: base.length };
}

function renderPracticeStep() {
  const { leftShuf, rightShuf, total } = buildPracticePairs();
  practiceMatched = new Set();
  firstPick = null;

  startPanelEl.innerHTML = `
    <h2 class="startTitle">Tap the matching pairs</h2>

    <div class="practiceHeader">
      <div class="practiceHint">Match the English with the Chinese</div>
      <div><strong id="pairCount">0</strong> / ${total} matched</div>
    </div>

    <div class="pairsGrid">
      <div class="pairCol" id="leftCol"></div>
      <div class="pairCol" id="rightCol"></div>
    </div>

    <div class="startActions">
      <button class="actionBtn secondary" id="backToCars">Back</button>
      <button class="actionBtn" id="continueBtn" disabled>Continue</button>
    </div>
  `;

  const leftCol = document.getElementById("leftCol");
  const rightCol = document.getElementById("rightCol");
  const pairCountEl = document.getElementById("pairCount");
  const continueBtn = document.getElementById("continueBtn");

  function updateMatchedUI() {
    pairCountEl.textContent = String(practiceMatched.size);
    continueBtn.disabled = practiceMatched.size !== total;
  }

  function clearActive() {
    [...startPanelEl.querySelectorAll(".pairBtn")].forEach(b => b.classList.remove("active"));
    firstPick = null;
  }

  function flashWrong(a, b) {
    a.classList.add("wrongFlash");
    b.classList.add("wrongFlash");
    setTimeout(() => {
      a.classList.remove("wrongFlash");
      b.classList.remove("wrongFlash");
    }, 220);
  }

  function handlePick(side, id, el) {
    if (practiceMatched.has(id)) return;

    // toggle off same button
    if (firstPick && firstPick.el === el) {
      clearActive();
      return;
    }

    if (!firstPick) {
      firstPick = { side, id, el };
      el.classList.add("active");
      return;
    }

    // if same column, switch selection
    if (firstPick.side === side) {
      firstPick.el.classList.remove("active");
      firstPick = { side, id, el };
      el.classList.add("active");
      return;
    }

    // compare ids
    const a = firstPick;
    const b = { side, id, el };

    if (a.id === b.id) {
      a.el.classList.remove("active");
      b.el.classList.remove("active");

      a.el.classList.add("matched");
      b.el.classList.add("matched");
      a.el.disabled = true;
      b.el.disabled = true;

      practiceMatched.add(id);
      firstPick = null;
      updateMatchedUI();
      return;
    }

    flashWrong(a.el, b.el);
    clearActive();
  }

  leftShuf.forEach(item => {
    const btn = document.createElement("button");
    btn.className = "pairBtn";
    btn.textContent = item.text;
    btn.addEventListener("click", () => handlePick("L", item.id, btn));
    leftCol.appendChild(btn);
  });

  rightShuf.forEach(item => {
    const btn = document.createElement("button");
    btn.className = "pairBtn";
    btn.textContent = item.text;
    btn.addEventListener("click", () => handlePick("R", item.id, btn));
    rightCol.appendChild(btn);
  });

  document.getElementById("backToCars").addEventListener("click", renderCarSelectStep);

  continueBtn.addEventListener("click", () => {
    startOverlayEl.style.display = "none";
    resetGame(); // start real gameplay
  });

  updateMatchedUI();
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

  WORDS.forEach(w => (w.seen = 0));

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

  if (round > TOTAL_ROUNDS) {
    declareWinnerByDistance();
    return;
  }

  wrongPenaltyUsed = false;

  currentWord = pickNextWord();
  currentWord.seen += 1;

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

function endRound({ rivalMoves }) {
  cancelAnimationFrame(animId);

  if (rivalMoves) {
    rivalPos = clamp(rivalPos + 1, 0, STEPS);
  }

  updateRaceUI();

  if (playerPos >= STEPS) return declareWinnerByFinish("player");
  if (rivalPos >= STEPS) return declareWinnerByFinish("rival");

  round += 1;

  if (round > TOTAL_ROUNDS) {
    declareWinnerByDistance();
    return;
  }

  lastT = 0;
  animId = requestAnimationFrame(tick);
  spawnRound();
}

function handleChoice(chosenWord, btn) {
  if (!running) return;

  if (chosenWord === currentWord) {
    score += 1;
    playerPos = clamp(playerPos + 2, 0, STEPS);

    btn.classList.add("correct");
    wordEl.classList.add("pop");

    running = false;
    setTimeout(() => {
      running = true;
      endRound({ rivalMoves: false });
    }, 200);

    updateTopUI();
    updateRaceUI();
    return;
  }

  btn.classList.add("wrong");

  if (!wrongPenaltyUsed) {
    wrongPenaltyUsed = true;

    playerPos = clamp(playerPos - 1, 0, STEPS);
    rivalPos = clamp(rivalPos + 1, 0, STEPS);

    updateRaceUI();

    if (rivalPos >= STEPS) return declareWinnerByFinish("rival");
  }
}

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

  document.getElementById("playAgain").onclick = () => {
    // show car + practice again on replay:
    showStartOverlay();
    // if you want instant replay instead, use:
    // resetGame();
  };
}

// =====================
// EVENTS
// =====================
modeToggleEl.addEventListener("click", () => {
  modeJP = !modeJP;
  resetGame();
});

window.addEventListener("resize", () => {
  computeImpactY();
  updateRaceUI();
});

// init
document.documentElement.style.setProperty("--steps", String(STEPS));
applyCarChoice();
showStartOverlay();

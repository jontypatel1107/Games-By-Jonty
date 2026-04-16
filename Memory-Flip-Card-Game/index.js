const board = document.getElementById('board');
const movesEl = document.getElementById('moves');
const pairsEl = document.getElementById('pairs');
const timeEl = document.getElementById('timeLeft');
const bestScoreEl = document.getElementById('bestScore');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const resetBtn = document.getElementById('resetBtn');
const overlay = document.getElementById('countdownOverlay');
const confettiLayer = document.getElementById('confettiLayer');
const gameStatus = document.getElementById('gameStatus');
const roundStatus = document.getElementById('roundStatus');
const timerFill = document.getElementById('timerFill');
const appShell = document.querySelector('.app-shell');
const difficultyButtons = document.querySelectorAll('.difficulty-btn');
const themeButtons = document.querySelectorAll('.theme-btn');

const DIFFICULTIES = {
    easy: { label: 'Easy', pairs: 4, time: 45, columns: 4 },
    normal: { label: 'Normal', pairs: 9, time: 60, columns: 6 },
    hard: { label: 'Hard', pairs: 12, time: 75, columns: 6 },
};

const THEMES = {
    midnight: { label: 'Midnight' },
    sunset: { label: 'Sunset' },
    aurora: { label: 'Aurora' },
};

const SYMBOL_POOL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const DIFFICULTY_STORAGE_KEY = 'memory_flip_difficulty';
const THEME_STORAGE_KEY = 'memory_flip_theme';
const BEST_STORAGE_PREFIX = 'memory_flip_best_moves_';
const REVEAL_DELAY = 720;
const DEFAULT_DIFFICULTY = 'normal';
const DEFAULT_THEME = 'midnight';

let currentDifficultyKey = loadSavedDifficulty();
let currentThemeKey = loadSavedTheme();
let currentDifficulty = DIFFICULTIES[currentDifficultyKey];
let deck = [];
let firstCard = null;
let secondCard = null;
let locked = false;
let moves = 0;
let matchedPairs = 0;
let totalPairs = currentDifficulty.pairs;
let timeLimit = currentDifficulty.time;
let timeLeft = timeLimit;
let timerId = null;
let countdownId = null;
let roundActive = false;
let roundFinished = false;
let bestMoves = null;
let roundTimeouts = [];
let audioContext = null;

function loadSavedDifficulty() {
    const saved = localStorage.getItem(DIFFICULTY_STORAGE_KEY);
    return DIFFICULTIES[saved] ? saved : DEFAULT_DIFFICULTY;
}

function loadSavedTheme() {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES[saved] ? saved : DEFAULT_THEME;
}

function saveDifficulty(key) {
    localStorage.setItem(DIFFICULTY_STORAGE_KEY, key);
}

function saveTheme(key) {
    localStorage.setItem(THEME_STORAGE_KEY, key);
}

function ensureAudioContext() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
        return null;
    }

    if (!audioContext) {
        audioContext = new AudioCtor();
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
    }

    return audioContext;
}

function unlockAudio() {
    ensureAudioContext();
}

function playTone(frequency, duration, type = 'sine', gainValue = 0.05, delay = 0) {
    const ctx = ensureAudioContext();
    if (!ctx) {
        return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startTime = ctx.currentTime + delay;
    const stopTime = startTime + duration;

    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(stopTime + 0.02);
}

function playFlipSound() {
    playTone(540, 0.05, 'triangle', 0.025);
}

function playMatchSound() {
    playTone(660, 0.08, 'sine', 0.04);
    playTone(880, 0.1, 'sine', 0.032, 0.09);
}

function playMismatchSound() {
    playTone(180, 0.09, 'sawtooth', 0.035);
}

function playStartSound() {
    playTone(420, 0.08, 'triangle', 0.03);
    playTone(620, 0.1, 'triangle', 0.04, 0.12);
}

function playWinSound() {
    playTone(523.25, 0.09, 'sine', 0.04);
    playTone(659.25, 0.09, 'sine', 0.04, 0.11);
    playTone(783.99, 0.12, 'sine', 0.05, 0.22);
}

function loadBestMoves() {
    const saved = Number(localStorage.getItem(`${BEST_STORAGE_PREFIX}${currentDifficultyKey}`));
    bestMoves = Number.isFinite(saved) && saved > 0 ? saved : null;
}

function saveBestMoves() {
    if (bestMoves == null) {
        localStorage.removeItem(`${BEST_STORAGE_PREFIX}${currentDifficultyKey}`);
        return;
    }

    localStorage.setItem(`${BEST_STORAGE_PREFIX}${currentDifficultyKey}`, String(bestMoves));
}

function shuffle(values) {
    const next = [...values];
    for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
}

function buildDeck() {
    const symbols = SYMBOL_POOL.slice(0, totalPairs);
    deck = shuffle([...symbols, ...symbols]);
}

function renderStats() {
    movesEl.textContent = String(moves);
    pairsEl.textContent = `${matchedPairs}/${totalPairs}`;
    timeEl.textContent = String(Math.max(0, timeLeft));
    bestScoreEl.textContent = bestMoves == null ? '-' : String(bestMoves);
    const progress = Math.max(0, Math.min(1, timeLeft / timeLimit));
    timerFill.style.transform = `scaleX(${progress})`;

    if (timeLeft <= 5) {
        timeEl.style.color = 'var(--danger)';
    } else if (timeLeft <= 10) {
        timeEl.style.color = 'var(--accent)';
    } else {
        timeEl.style.color = '';
    }
}

function setStatus(message, roundMessage) {
    gameStatus.textContent = message;
    roundStatus.textContent = roundMessage;
}

function updateDifficultyButtons() {
    difficultyButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.difficulty === currentDifficultyKey);
    });
}

function updateThemeButtons() {
    themeButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.theme === currentThemeKey);
    });
}

function applyTheme(key) {
    const nextKey = THEMES[key] ? key : DEFAULT_THEME;
    currentThemeKey = nextKey;
    document.body.dataset.theme = nextKey;
    saveTheme(nextKey);
    updateThemeButtons();
}

function clearRoundTimeouts() {
    roundTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    roundTimeouts = [];
}

function clearCountdown() {
    if (countdownId != null) {
        clearInterval(countdownId);
        countdownId = null;
    }
}

function stopTimer() {
    if (timerId != null) {
        clearInterval(timerId);
        timerId = null;
    }
}

function clearSelection() {
    firstCard = null;
    secondCard = null;
    locked = false;
}

function clearConfetti() {
    confettiLayer.innerHTML = '';
}

function hideOverlay() {
    overlay.classList.remove('visible');
    overlay.innerHTML = '';
}

function showCountdown(message, duration = 700) {
    overlay.innerHTML = `
        <div class="overlay-card">
            <h2>${message}</h2>
            <p>Get ready.</p>
        </div>
    `;
    overlay.classList.add('visible');

    const timeoutId = setTimeout(() => {
        hideOverlay();
    }, duration);
    roundTimeouts.push(timeoutId);
}

function showSummaryModal({ title, message, stats, primaryLabel, secondaryLabel }) {
    const statsMarkup = stats
        .map((item) => `
            <div class="summary-stat">
                <span>${item.label}</span>
                <strong>${item.value}</strong>
            </div>
        `)
        .join('');

    overlay.innerHTML = `
        <div class="overlay-card">
            <h2>${title}</h2>
            <p>${message}</p>
            <div class="summary-grid">
                ${statsMarkup}
            </div>
            <div class="overlay-actions">
                <button type="button" class="overlay-btn primary" data-action="replay">${primaryLabel}</button>
                <button type="button" class="overlay-btn secondary" data-action="close">${secondaryLabel}</button>
            </div>
        </div>
    `;
    overlay.classList.add('visible');
}

function burstConfetti() {
    clearConfetti();
    const colors = ['#38bdf8', '#f97316', '#22c55e', '#facc15', '#fb7185'];
    const count = Math.min(54, 18 + totalPairs * 3);

    for (let i = 0; i < count; i += 1) {
        const piece = document.createElement('span');
        piece.className = 'confetti-piece';
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = colors[i % colors.length];
        piece.style.width = `${0.45 + Math.random() * 0.45}rem`;
        piece.style.height = `${0.9 + Math.random() * 0.85}rem`;
        piece.style.setProperty('--drift', `${Math.round((Math.random() * 2 - 1) * 140)}px`);
        piece.style.setProperty('--fall-duration', `${1.8 + Math.random() * 1.4}s`);
        piece.style.setProperty('--wobble-duration', `${0.45 + Math.random() * 0.45}s`);
        piece.style.transform = `rotate(${Math.random() * 180}deg)`;
        confettiLayer.appendChild(piece);
    }

    const cleanupId = setTimeout(clearConfetti, 3200);
    roundTimeouts.push(cleanupId);
}

function createCard(symbol, index) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.value = symbol;
    card.setAttribute('aria-label', `Memory card ${index + 1}`);

    card.innerHTML = `
        <span class="card-inner">
            <span class="card-face card-front" aria-hidden="true"></span>
            <span class="card-face card-back" aria-hidden="true">${symbol}</span>
        </span>
    `;

    card.addEventListener('click', () => handleCardClick(card));
    return card;
}

function renderBoard() {
    board.innerHTML = '';
    board.style.setProperty('--board-columns', String(currentDifficulty.columns));

    deck.forEach((symbol, index) => {
        board.appendChild(createCard(symbol, index));
    });
}

function prepareRound() {
    clearCountdown();
    clearRoundTimeouts();
    stopTimer();
    hideOverlay();
    clearConfetti();
    buildDeck();
    renderBoard();
    moves = 0;
    matchedPairs = 0;
    timeLeft = timeLimit;
    roundActive = false;
    roundFinished = false;
    locked = false;
    clearSelection();
    appShell.classList.remove('round-finish');
    loadBestMoves();
    renderStats();
    setStatus('Ready to play', `${currentDifficulty.label} mode • Tap Start Game to begin`);
    startBtn.disabled = false;
    restartBtn.disabled = false;
    resetBtn.disabled = false;
}

function setDifficulty(key, options = {}) {
    const nextKey = DIFFICULTIES[key] ? key : DEFAULT_DIFFICULTY;
    currentDifficultyKey = nextKey;
    currentDifficulty = DIFFICULTIES[nextKey];
    totalPairs = currentDifficulty.pairs;
    timeLimit = currentDifficulty.time;
    timeLeft = timeLimit;
    saveDifficulty(currentDifficultyKey);
    loadBestMoves();
    updateDifficultyButtons();
    renderStats();

    if (options.silent) {
        return;
    }

    prepareRound();
}

function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
        if (!roundActive || roundFinished) {
            return;
        }

        timeLeft -= 1;
        renderStats();

        if (timeLeft <= 0) {
            endRound(false, 'Time is up');
        }
    }, 1000);
}

function startRound(withCountdown = true) {
    clearCountdown();
    clearRoundTimeouts();
    hideOverlay();
    clearConfetti();
    prepareRound();
    roundActive = true;
    setStatus('Round started', `Find all ${totalPairs} pairs before the clock hits zero`);
    startBtn.disabled = true;
    playStartSound();

    const begin = () => {
        hideOverlay();
        startTimer();
    };

    if (withCountdown) {
        let count = 3;
        showCountdown(String(count), 550);
        countdownId = setInterval(() => {
            count -= 1;
            if (count > 0) {
                showCountdown(String(count), 450);
                return;
            }

            clearCountdown();
            showCountdown('Go!', 350);
            const launchId = setTimeout(begin, 340);
            roundTimeouts.push(launchId);
        }, 650);
        return;
    }

    begin();
}

function restartRound() {
    startRound(true);
}

function resetGame() {
    clearCountdown();
    clearRoundTimeouts();
    stopTimer();
    hideOverlay();
    clearConfetti();
    roundActive = false;
    roundFinished = false;
    appShell.classList.remove('round-finish');
    prepareRound();
}

function updateBestMoves() {
    if (bestMoves == null || moves < bestMoves) {
        bestMoves = moves;
        saveBestMoves();
        bestScoreEl.textContent = String(bestMoves);
    }
}

function endRound(completed, reason) {
    if (roundFinished) {
        return;
    }

    roundFinished = true;
    roundActive = false;
    locked = true;
    stopTimer();
    clearCountdown();
    clearRoundTimeouts();
    appShell.classList.add('round-finish');

    if (completed || matchedPairs === totalPairs) {
        const previousBest = bestMoves;
        updateBestMoves();
        const newBest = previousBest == null || moves < previousBest;
        setStatus('You won!', `Completed ${currentDifficulty.label} in ${moves} moves`);
        showSummaryModal({
            title: newBest ? 'New best run!' : 'Perfect memory!',
            message: 'You matched every pair on the board.',
            stats: [
                { label: 'Moves', value: moves },
                { label: 'Pairs', value: `${matchedPairs}/${totalPairs}` },
                { label: 'Time left', value: `${Math.max(0, timeLeft)}s` },
                { label: 'Best moves', value: bestMoves ?? '-' },
            ],
            primaryLabel: 'Play Again',
            secondaryLabel: 'Close',
        });
        playWinSound();
        burstConfetti();
    } else {
        setStatus('Round ended', reason);
        showSummaryModal({
            title: 'Round over',
            message: reason,
            stats: [
                { label: 'Moves', value: moves },
                { label: 'Pairs', value: `${matchedPairs}/${totalPairs}` },
                { label: 'Time left', value: `${Math.max(0, timeLeft)}s` },
                { label: 'Difficulty', value: currentDifficulty.label },
            ],
            primaryLabel: 'Try Again',
            secondaryLabel: 'Close',
        });
        playTone(220, 0.14, 'sawtooth', 0.03);
    }

    startBtn.disabled = false;
    restartBtn.disabled = false;
    resetBtn.disabled = false;
    renderStats();
}

function handleMatch(cardA, cardB) {
    cardA.classList.add('matched');
    cardB.classList.add('matched');
    cardA.disabled = true;
    cardB.disabled = true;
    matchedPairs += 1;
    playMatchSound();
    pairsEl.textContent = `${matchedPairs}/${totalPairs}`;

    if (matchedPairs === totalPairs) {
        endRound(true, 'All pairs matched');
        return;
    }

    setStatus('Nice match!', `${totalPairs - matchedPairs} pairs left`);
    clearSelection();
}

function handleMismatch(cardA, cardB) {
    locked = true;
    cardA.classList.add('mismatch');
    cardB.classList.add('mismatch');
    playMismatchSound();
    setStatus('Try again', 'Those cards do not match');

    const timeoutId = setTimeout(() => {
        cardA.classList.remove('flipped', 'mismatch');
        cardB.classList.remove('flipped', 'mismatch');
        clearSelection();
    }, REVEAL_DELAY);

    roundTimeouts.push(timeoutId);
}

function handleCardClick(card) {
    unlockAudio();

    if (!roundActive || roundFinished || locked || card.classList.contains('matched') || card === firstCard) {
        return;
    }

    playFlipSound();
    card.classList.add('flipped');

    if (!firstCard) {
        firstCard = card;
        setStatus('Keep going', 'Find the second card');
        return;
    }

    secondCard = card;
    moves += 1;
    renderStats();

    const isMatch = firstCard.dataset.value === secondCard.dataset.value;
    if (isMatch) {
        handleMatch(firstCard, secondCard);
        return;
    }

    handleMismatch(firstCard, secondCard);
}

difficultyButtons.forEach((button) => {
    button.addEventListener('click', () => {
        unlockAudio();
        setDifficulty(button.dataset.difficulty);
    });
});

themeButtons.forEach((button) => {
    button.addEventListener('click', () => {
        applyTheme(button.dataset.theme);
    });
});

startBtn.addEventListener('click', () => {
    unlockAudio();
    startRound(true);
});

restartBtn.addEventListener('click', () => {
    unlockAudio();
    restartRound();
});

resetBtn.addEventListener('click', () => {
    unlockAudio();
    resetGame();
});

overlay.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
        const action = actionButton.dataset.action;
        if (action === 'replay') {
            startRound(true);
            return;
        }
        if (action === 'close') {
            hideOverlay();
            return;
        }
    }

    if (event.target === overlay && roundFinished) {
        hideOverlay();
    }
});

applyTheme(currentThemeKey);
updateDifficultyButtons();
setDifficulty(currentDifficultyKey, { silent: true });
prepareRound();

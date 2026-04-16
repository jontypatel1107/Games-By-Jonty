const scoreDisplay = document.querySelector('#score');
const timeLeftDisplay = document.querySelector('#timeLeft');
const maxScoreDisplay = document.querySelector('#maxScore');
const gameStatus = document.querySelector('#gameStatus');
const comboStatus = document.querySelector('#comboStatus');
const timerFill = document.querySelector('#timerFill');
const difficultyHint = document.querySelector('#difficultyHint');
const easyBtn = document.querySelector('#easyBtn');
const normalBtn = document.querySelector('#normalBtn');
const hardBtn = document.querySelector('#hardBtn');
const appShell = document.querySelector('.app-shell');
const startBtn = document.querySelector('#startBtn');
const pauseBtn = document.querySelector('#pauseBtn');
const resumeBtn = document.querySelector('#resumeBtn');
const holes = Array.from(document.querySelectorAll('.hole'));

const ROUND_TIME = 30;
const STORAGE_KEY = 'whack_a_mole_best_score';
const DIFFICULTY_KEY = 'whack_a_mole_difficulty';
const DIFFICULTY_LEVELS = {
    easy: {
        label: 'Easy speed',
        spawnInterval: 1100,
        visibleMs: 750
    },
    normal: {
        label: 'Normal speed',
        spawnInterval: 800,
        visibleMs: 550
    },
    hard: {
        label: 'Hard speed',
        spawnInterval: 600,
        visibleMs: 420
    }
};

let score = 0;
let bestScore = 0;
let timeLeft = ROUND_TIME;
let combo = 0;
let gameState = 'idle'; // idle | running | paused | ended
let selectedDifficulty = 'normal';
let activeHole = null;
let spawnTimer = null;
let countdownTimer = null;
let hideTimer = null;
let lastHoleIndex = -1;
let audioContext = null;

function loadBestScore() {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    bestScore = Number.isFinite(Number(saved)) ? Number(saved) : 0;
    const savedDifficulty = window.localStorage.getItem(DIFFICULTY_KEY);
    if (savedDifficulty && DIFFICULTY_LEVELS[savedDifficulty]) {
        selectedDifficulty = savedDifficulty;
    }
}

function saveBestScore(value) {
    bestScore = Math.max(bestScore, value);
    window.localStorage.setItem(STORAGE_KEY, String(bestScore));
}

function updateTimerBar() {
    const progress = Math.max(timeLeft, 0) / ROUND_TIME;
    timerFill.style.transform = `scaleX(${progress})`;
}

function getDifficultyConfig() {
    return DIFFICULTY_LEVELS[selectedDifficulty] || DIFFICULTY_LEVELS.normal;
}

function updateDifficultyUI() {
    const config = getDifficultyConfig();
    difficultyHint.textContent = config.label;
    easyBtn.classList.toggle('active', selectedDifficulty === 'easy');
    normalBtn.classList.toggle('active', selectedDifficulty === 'normal');
    hardBtn.classList.toggle('active', selectedDifficulty === 'hard');
}

function updateUI() {
    scoreDisplay.textContent = String(score);
    timeLeftDisplay.textContent = String(timeLeft);
    maxScoreDisplay.textContent = String(bestScore);
    comboStatus.textContent = `Combo x${combo}`;
    updateTimerBar();
}

function setStatus(message) {
    gameStatus.textContent = message;
}

function setButtonState() {
    startBtn.disabled = gameState === 'running';
    pauseBtn.disabled = gameState !== 'running';
    resumeBtn.disabled = gameState !== 'paused';

    if (gameState === 'ended') {
        startBtn.disabled = false;
        startBtn.textContent = 'Play Again';
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
    } else if (gameState === 'idle') {
        startBtn.textContent = 'Start Game';
    } else {
        startBtn.textContent = 'Start Game';
    }
}

function clearTimers() {
    clearInterval(spawnTimer);
    clearInterval(countdownTimer);
    clearTimeout(hideTimer);
    spawnTimer = null;
    countdownTimer = null;
    hideTimer = null;
}

function clearActiveMole() {
    if (!activeHole) {
        return;
    }

    activeHole.classList.remove('whacked');
    activeHole.querySelector('.mole').classList.remove('up');
    activeHole = null;
}

function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    return audioContext;
}

function playTone(frequency, duration, type = 'sine', gainValue = 0.05) {
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = type;
        oscillator.frequency.value = frequency;
        gainNode.gain.value = gainValue;

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        const now = ctx.currentTime;
        gainNode.gain.setValueAtTime(gainValue, now);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        oscillator.start(now);
        oscillator.stop(now + duration);
    } catch (error) {
        // Audio is a nice-to-have.
    }
}

function playHitSound(comboValue) {
    const pitch = comboValue >= 5 ? 880 : comboValue >= 3 ? 740 : 620;
    playTone(pitch, 0.08, 'triangle', 0.055);
}

function playMissSound() {
    playTone(220, 0.09, 'sawtooth', 0.04);
    window.setTimeout(() => playTone(165, 0.12, 'sawtooth', 0.035), 90);
}

function playStartSound() {
    playTone(392, 0.08, 'triangle', 0.05);
    window.setTimeout(() => playTone(523, 0.1, 'triangle', 0.05), 90);
}

function playFinishSound() {
    playTone(523, 0.08, 'sine', 0.05);
    window.setTimeout(() => playTone(659, 0.09, 'sine', 0.05), 100);
    window.setTimeout(() => playTone(784, 0.11, 'sine', 0.05), 210);
}

function setDifficulty(difficulty) {
    if (!DIFFICULTY_LEVELS[difficulty]) {
        return;
    }

    if (gameState === 'running' || gameState === 'paused') {
        setStatus('Finish the current round before changing difficulty.');
        return;
    }

    selectedDifficulty = difficulty;
    window.localStorage.setItem(DIFFICULTY_KEY, difficulty);
    updateDifficultyUI();
    setStatus(`${DIFFICULTY_LEVELS[difficulty].label} selected`);
}

function pickHole() {
    if (holes.length === 1) {
        return holes[0];
    }

    let index = Math.floor(Math.random() * holes.length);
    if (index === lastHoleIndex) {
        index = (index + 1) % holes.length;
    }

    lastHoleIndex = index;
    return holes[index];
}

function spawnMole() {
    if (gameState !== 'running') {
        return;
    }

    const { visibleMs } = getDifficultyConfig();
    clearTimeout(hideTimer);
    clearActiveMole();

    const hole = pickHole();
    const mole = hole.querySelector('.mole');

    hole.classList.remove('whacked');
    mole.classList.add('up');
    activeHole = hole;

    hideTimer = window.setTimeout(() => {
        if (gameState !== 'running' || activeHole !== hole) {
            return;
        }

        mole.classList.remove('up');
        hole.classList.remove('whacked');
        activeHole = null;
        combo = 0;
        playMissSound();
        setStatus('Missed one. Keep going!');
        updateUI();
    }, visibleMs);
}

function startRound() {
    clearTimers();

    score = 0;
    combo = 0;
    timeLeft = ROUND_TIME;
    activeHole = null;
    lastHoleIndex = -1;
    gameState = 'running';
    const { spawnInterval } = getDifficultyConfig();

    setStatus('Go! Whack the moles.');
    setButtonState();
    updateUI();
    playStartSound();
    appShell.classList.remove('round-finish');

    spawnMole();
    spawnTimer = window.setInterval(spawnMole, spawnInterval);
    countdownTimer = window.setInterval(() => {
        timeLeft -= 1;
        if (timeLeft <= 0) {
            endRound();
            return;
        }

        updateUI();
    }, 1000);
}

function pauseRound() {
    if (gameState !== 'running') {
        return;
    }

    gameState = 'paused';
    clearTimers();
    clearActiveMole();
    setStatus('Paused');
    setButtonState();
    updateUI();
}

function resumeRound() {
    if (gameState !== 'paused') {
        return;
    }

    gameState = 'running';
    setStatus('Back in action');
    setButtonState();
    updateUI();

    const { spawnInterval } = getDifficultyConfig();
    spawnMole();
    spawnTimer = window.setInterval(spawnMole, spawnInterval);
    countdownTimer = window.setInterval(() => {
        timeLeft -= 1;
        if (timeLeft <= 0) {
            endRound();
            return;
        }

        updateUI();
    }, 1000);
}

function endRound() {
    if (gameState === 'ended') {
        return;
    }

    clearTimers();
    clearActiveMole();
    gameState = 'ended';
    const previousBest = bestScore;
    saveBestScore(score);
    playFinishSound();
    appShell.classList.add('round-finish');
    setStatus(score > previousBest ? 'New high score! Press play again to beat it.' : 'Round over. Try again!');
    setButtonState();
    updateUI();
    window.setTimeout(() => {
        appShell.classList.remove('round-finish');
    }, 900);
}

function resetGame() {
    clearTimers();
    clearActiveMole();
    score = 0;
    combo = 0;
    timeLeft = ROUND_TIME;
    gameState = 'idle';
    lastHoleIndex = -1;
    setStatus('Ready to play');
    setButtonState();
    appShell.classList.remove('round-finish');
    updateUI();
}

function bonk(event) {
    if (gameState !== 'running') {
        return;
    }

    const hole = event.currentTarget;
    if (hole !== activeHole) {
        combo = 0;
        setStatus('Close, but that one got away.');
        updateUI();
        return;
    }

    clearTimeout(hideTimer);
    hideTimer = null;

    score += 1;
    combo += 1;
    hole.classList.add('whacked');
    hole.querySelector('.mole').classList.remove('up');
    activeHole = null;
    playHitSound(combo);

    setStatus(combo >= 3 ? 'Combo streak!' : 'Nice hit!');
    updateUI();

    window.setTimeout(() => {
        if (gameState === 'running') {
            spawnMole();
        }
    }, 150);
}

function initialize() {
    loadBestScore();
    updateDifficultyUI();
    updateUI();
    setButtonState();
    setStatus('Ready to play');
}

holes.forEach((hole) => {
    hole.addEventListener('click', bonk);
});

startBtn.addEventListener('click', startRound);
pauseBtn.addEventListener('click', pauseRound);
resumeBtn.addEventListener('click', resumeRound);
easyBtn.addEventListener('click', () => setDifficulty('easy'));
normalBtn.addEventListener('click', () => setDifficulty('normal'));
hardBtn.addEventListener('click', () => setDifficulty('hard'));

initialize();

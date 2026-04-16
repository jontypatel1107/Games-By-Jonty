const textDisplay = document.querySelector('#textDisplay');
const typingArea = document.querySelector('#typingArea');
const timerDisplay = document.querySelector('#timer');
const wpmDisplay = document.querySelector('#wpm');
const accuracyDisplay = document.querySelector('#accuracy');
const bestWPMDisplay = document.querySelector('#bestWPM');
const progressLabel = document.querySelector('#progressLabel');
const progressFill = document.querySelector('#progressFill');
const sessionStatus = document.querySelector('#sessionStatus');
const leaderBestWPM = document.querySelector('#leaderBestWPM');
const leaderBestAccuracy = document.querySelector('#leaderBestAccuracy');
const leaderLastScore = document.querySelector('#leaderLastScore');
const appShell = document.querySelector('.app-shell');
const easyBtn = document.querySelector('#easy');
const normalBtn = document.querySelector('#normal');
const hardBtn = document.querySelector('#hard');
const startBtn = document.querySelector('#startBtn');
const resetBtn = document.querySelector('#resetBtn');
const fifteen = document.querySelector('#fifteen');
const thirty = document.querySelector('#thirty');
const sixty = document.querySelector('#sixty');
const difficultyButtons = {
    easy: easyBtn,
    normal: normalBtn,
    hard: hardBtn
};

const textSets = {
    easy: [
        'The sun is warm and bright.',
        'Practice every day to improve.',
        'Typing well takes calm focus.',
        'Small steps build big skills.'
    ],
    normal: [
        'The quick brown fox jumps over the lazy dog. Practice makes perfect when learning to type faster.',
        'Technology has revolutionized the way we communicate and work in the modern digital era.',
        'Typing speed is an essential skill for anyone working with computers in today\'s workplace.',
        'Small habits, repeated every day, become impressive skills over time.',
        'Focus on accuracy first and speed will follow as your fingers learn the rhythm.'
    ],
    hard: [
        'A surprisingly deft typist can maintain accuracy even when the sentence structure becomes unusually dense and expressive.',
        'Coordinating speed, precision, and endurance is what turns ordinary practice into a measurable advantage.',
        'When punctuation, commas, and longer words appear together, consistency matters more than raw burst speed.',
        'Deliberate repetition and careful attention to detail create faster hands and calmer thinking under pressure.'
    ]
};

const durationButtons = {
    15: fifteen,
    30: thirty,
    60: sixty
};

const storageKey = 'typing_best_wpm';
const storageAccuracyKey = 'typing_best_accuracy';
const storageLastScoreKey = 'typing_last_score';
const storageDifficultyKey = 'typing_selected_difficulty';

let selectedDuration = 60;
let timeLeft = selectedDuration;
let timerId = null;
let sessionState = 'idle';
let activeText = '';
let bestWPM = 0;
let bestAccuracy = 0;
let currentWpm = 0;
let currentAccuracy = 100;
let selectedDifficulty = 'easy';
let audioContext = null;

function loadBestWpm() {
    const saved = window.localStorage.getItem(storageKey);
    bestWPM = Number.isFinite(Number(saved)) ? Number(saved) : 0;
    const savedAccuracy = window.localStorage.getItem(storageAccuracyKey);
    bestAccuracy = Number.isFinite(Number(savedAccuracy)) ? Number(savedAccuracy) : 0;
    const savedDifficulty = window.localStorage.getItem(storageDifficultyKey);
    if (savedDifficulty && textSets[savedDifficulty]) {
        selectedDifficulty = savedDifficulty;
    }
}

function saveBestStats(value, accuracy) {
    bestWPM = Math.max(bestWPM, value);
    bestAccuracy = Math.max(bestAccuracy, accuracy);
    window.localStorage.setItem(storageKey, String(bestWPM));
    window.localStorage.setItem(storageAccuracyKey, String(bestAccuracy));
    bestWPMDisplay.textContent = String(bestWPM);
    leaderBestWPM.textContent = String(bestWPM);
    leaderBestAccuracy.textContent = `${bestAccuracy}%`;
}

function setStatus(message) {
    sessionStatus.textContent = message;
}

function setDuration(duration) {
    selectedDuration = duration;
    timeLeft = duration;
    timerDisplay.textContent = String(timeLeft);

    Object.entries(durationButtons).forEach(([value, button]) => {
        button.classList.toggle('active', Number(value) === duration);
    });

    updateProgress();
}

function setDifficulty(difficulty) {
    if (!textSets[difficulty]) {
        return;
    }

    selectedDifficulty = difficulty;
    window.localStorage.setItem(storageDifficultyKey, difficulty);

    Object.entries(difficultyButtons).forEach(([key, button]) => {
        button.classList.toggle('active', key === difficulty);
    });

    setStatus(`${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} texts selected`);
}

function pickPrompt() {
    const pool = textSets[selectedDifficulty] || textSets.normal;
    return pool[Math.floor(Math.random() * pool.length)];
}

function escapeHtml(character) {
    return character
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderText(typed = '') {
    let html = '';

    for (let index = 0; index < activeText.length; index += 1) {
        const char = activeText[index];
        const typedChar = typed[index];
        let className = '';

        if (index < typed.length) {
            className = typedChar === char ? 'correct' : 'incorrect';
        } else if (index === typed.length && sessionState === 'running') {
            className = 'current';
        }

        const safeChar = char === ' ' ? '&nbsp;' : char === '\n' ? '<br>' : escapeHtml(char);
        html += className ? `<span class="${className}">${safeChar}</span>` : safeChar;
    }

    textDisplay.innerHTML = html || 'Choose a duration and press Start Test.';
}

function getCorrectCharacters(typed) {
    let correct = 0;
    const limit = Math.min(typed.length, activeText.length);

    for (let index = 0; index < limit; index += 1) {
        if (typed[index] === activeText[index]) {
            correct += 1;
        }
    }

    return correct;
}

function updateStats() {
    const typed = typingArea.value;
    const correctChars = getCorrectCharacters(typed);
    const typedChars = typed.length;
    const elapsedSeconds = Math.max(selectedDuration - timeLeft, 0);
    const elapsedMinutes = Math.max(elapsedSeconds / 60, 1 / 60);

    currentWpm = typedChars > 0 ? Math.round((correctChars / 5) / elapsedMinutes) : 0;
    currentAccuracy = typedChars > 0 ? Math.round((correctChars / typedChars) * 100) : 100;

    wpmDisplay.textContent = String(currentWpm);
    accuracyDisplay.textContent = `${currentAccuracy}%`;
}

function appendNextPrompt() {
    const nextPrompt = pickPrompt();
    activeText = activeText ? `${activeText} ${nextPrompt}` : nextPrompt;
}

function ensureTextLengthForInput() {
    const typed = typingArea.value;

    while (activeText.length <= typed.length) {
        appendNextPrompt();
    }
}

function tick() {
    timeLeft -= 1;
    timerDisplay.textContent = String(timeLeft);
    updateProgress();

    if (timeLeft <= 0) {
        endSession();
    }
}

function updateProgress() {
    const total = selectedDuration || 1;
    const remaining = Math.max(timeLeft, 0);
    const percentRemaining = (remaining / total) * 100;

    progressFill.style.transform = `scaleX(${percentRemaining / 100})`;
    progressLabel.textContent = `${remaining}s remaining`;
}

function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    return audioContext;
}

function playTone(frequency, duration, type = 'sine', gainValue = 0.06) {
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

function playStartSound() {
    playTone(440, 0.08, 'triangle', 0.05);
    window.setTimeout(() => playTone(660, 0.1, 'triangle', 0.05), 90);
}

function playFinishSound() {
    playTone(392, 0.08, 'sine', 0.06);
    window.setTimeout(() => playTone(330, 0.1, 'sine', 0.05), 100);
    window.setTimeout(() => playTone(262, 0.12, 'sine', 0.05), 210);
}

function launchConfetti() {
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';

    const colors = ['#22c55e', '#38bdf8', '#fb7185', '#f59e0b', '#a78bfa'];
    const count = 28;

    for (let index = 0; index < count; index += 1) {
        const piece = document.createElement('span');
        piece.className = 'confetti-piece';
        const left = Math.random() * 100;
        const drift = `${(Math.random() * 2 - 1) * 16}rem`;
        const spin = `${(Math.random() * 720 + 180) * (Math.random() > 0.5 ? 1 : -1)}deg`;
        const fallDuration = `${900 + Math.random() * 700}ms`;

        piece.style.left = `${left}vw`;
        piece.style.background = colors[index % colors.length];
        piece.style.setProperty('--drift', drift);
        piece.style.setProperty('--spin', spin);
        piece.style.setProperty('--fall-duration', fallDuration);
        piece.style.animationDelay = `${Math.random() * 120}ms`;

        layer.appendChild(piece);
    }

    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), 1800);
}

function startSession() {
    if (sessionState === 'running') {
        return;
    }

    clearInterval(timerId);
    sessionState = 'running';
    timeLeft = selectedDuration;
    activeText = pickPrompt();
    currentWpm = 0;

    startBtn.disabled = true;
    startBtn.textContent = 'Running...';
    typingArea.disabled = false;
    typingArea.value = '';
    typingArea.focus();

    setStatus('Typing now');
    timerDisplay.textContent = String(timeLeft);
    wpmDisplay.textContent = '0';
    accuracyDisplay.textContent = '100%';
    currentAccuracy = 100;
    updateProgress();
    renderText('');
    appShell.classList.remove('session-ended');
    playStartSound();

    timerId = window.setInterval(tick, 1000);
}

function endSession() {
    clearInterval(timerId);
    timerId = null;

    sessionState = 'finished';
    timeLeft = 0;
    timerDisplay.textContent = '0';
    typingArea.disabled = true;
    startBtn.disabled = false;
    startBtn.textContent = 'Start Again';

    updateStats();
    saveBestStats(currentWpm, currentAccuracy);
    window.localStorage.setItem(storageLastScoreKey, `${currentWpm} WPM at ${currentAccuracy}% accuracy`);
    leaderLastScore.textContent = `${currentWpm} WPM / ${currentAccuracy}%`;
    appShell.classList.add('session-ended');
    playFinishSound();
    launchConfetti();
    window.setTimeout(() => {
        appShell.classList.remove('session-ended');
    }, 700);

    if (currentWpm === 0) {
        setStatus('Time is up. Try again to build your rhythm.');
    } else {
        setStatus(`Test complete. Final score: ${currentWpm} WPM`);
    }

    renderText(typingArea.value);
}

function resetSession() {
    clearInterval(timerId);
    timerId = null;
    sessionState = 'idle';
    activeText = '';
    currentWpm = 0;
    timeLeft = selectedDuration;

    typingArea.value = '';
    typingArea.disabled = true;
    startBtn.disabled = false;
    startBtn.textContent = 'Start Test';
    timerDisplay.textContent = String(selectedDuration);
    wpmDisplay.textContent = '0';
    accuracyDisplay.textContent = '100%';
    currentWpm = 0;
    currentAccuracy = 100;
    updateProgress();
    setStatus('Ready to start');
    textDisplay.textContent = 'Choose a duration and press Start Test.';
    leaderLastScore.textContent = window.localStorage.getItem(storageLastScoreKey) || '--';
}

function handleTyping() {
    if (sessionState !== 'running') {
        return;
    }

    ensureTextLengthForInput();
    renderText(typingArea.value);
    updateStats();
}

function setDurationHandler(duration) {
    if (sessionState === 'running') {
        setStatus('Finish the current test before changing the duration.');
        return;
    }

    setDuration(duration);
    resetSession();
    setStatus(`${duration} second test selected`);
}

function setDifficultyHandler(difficulty) {
    if (sessionState === 'running') {
        setStatus('Finish the current test before changing the difficulty.');
        return;
    }

    setDifficulty(difficulty);
    resetSession();
}

function initialize() {
    loadBestWpm();
    bestWPMDisplay.textContent = String(bestWPM);
    leaderBestWPM.textContent = String(bestWPM);
    leaderBestAccuracy.textContent = `${bestAccuracy}%`;
    leaderLastScore.textContent = window.localStorage.getItem(storageLastScoreKey) || '--';
    setDuration(selectedDuration);
    setDifficulty(selectedDifficulty);
    resetSession();
}

startBtn.addEventListener('click', startSession);
resetBtn.addEventListener('click', resetSession);
typingArea.addEventListener('input', handleTyping);
typingArea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
    }
});

fifteen.addEventListener('click', () => setDurationHandler(15));
thirty.addEventListener('click', () => setDurationHandler(30));
sixty.addEventListener('click', () => setDurationHandler(60));
easyBtn.addEventListener('click', () => setDifficultyHandler('easy'));
normalBtn.addEventListener('click', () => setDifficultyHandler('normal'));
hardBtn.addEventListener('click', () => setDifficultyHandler('hard'));

initialize();

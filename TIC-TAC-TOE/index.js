const boxes = document.querySelectorAll(".box");
const rematchButton = document.querySelector(".rematch");
const resetScoresButton = document.querySelector(".reset");
const result = document.querySelector(".result");
const player1Input = document.querySelector("#player1");
const player2Input = document.querySelector("#player2");
const scoreName1 = document.querySelector("#score-name-1");
const scoreName2 = document.querySelector("#score-name-2");
const score1 = document.querySelector("#score-1");
const score2 = document.querySelector("#score-2");
const scoreDraws = document.querySelector("#score-draws");
const matchStatus = document.querySelector("#match-status");
const series1 = document.querySelector("#series-1");
const series2 = document.querySelector("#series-2");
const container = document.querySelector(".container");

const WINNING_LINES = [
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 4, 8],
    [2, 4, 6]
];

const scores = {
    player1: 0,
    player2: 0,
    draws: 0
};

const series = {
    player1: 0,
    player2: 0
};

let currentMark = "O";
let gameLocked = false;
let matchOver = false;
let audioContext = null;
const matchTarget = 2;

function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

function playTone(frequency, duration, type = "sine", gainValue = 0.05) {
    try {
        const ctx = getAudioContext();
        if (ctx.state === "suspended") {
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
        // Audio is a nice-to-have, so the game should still work silently.
    }
}

function playMoveSound(mark) {
    playTone(mark === "O" ? 520 : 360, 0.08, "triangle", 0.04);
}

function playWinSound() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((frequency, index) => {
        window.setTimeout(() => playTone(frequency, 0.12, "sine", 0.05), index * 110);
    });
}

function playDrawSound() {
    playTone(280, 0.12, "sawtooth", 0.035);
    window.setTimeout(() => playTone(220, 0.14, "sawtooth", 0.03), 90);
}

function getPlayer1Name() {
    return player1Input.value.trim() || "Player 1";
}

function getPlayer2Name() {
    return player2Input.value.trim() || "Player 2";
}

function syncPlayerLabels() {
    const name1 = getPlayer1Name();
    const name2 = getPlayer2Name();
    scoreName1.textContent = name1;
    scoreName2.textContent = name2;
    return { name1, name2 };
}

function getNameForMark(mark) {
    return mark === "O" ? getPlayer1Name() : getPlayer2Name();
}

function setStatus(message) {
    result.textContent = message;
}

function updateTurnMessage() {
    const { name1, name2 } = syncPlayerLabels();
    const activeName = currentMark === "O" ? name1 : name2;
    setStatus(`${activeName}'s turn`);
}

function clearWinningHighlight() {
    boxes.forEach((box) => box.classList.remove("winning-box"));
}

function setBoardLocked(locked) {
    boxes.forEach((box) => {
        box.disabled = locked || box.textContent !== "";
    });
}

function updateScoreboard() {
    score1.textContent = scores.player1;
    score2.textContent = scores.player2;
    scoreDraws.textContent = scores.draws;
    syncPlayerLabels();
}

function updateMatchStatus() {
    const { name1, name2 } = syncPlayerLabels();
    series1.textContent = series.player1;
    series2.textContent = series.player2;

    if (matchOver) {
        matchStatus.textContent = series.player1 >= matchTarget
            ? `${name1} won the match. Start a new one to play again.`
            : `${name2} won the match. Start a new one to play again.`;
        return;
    }

    matchStatus.textContent = `Round score: ${name1} ${series.player1} - ${series.player2} ${name2}. First to ${matchTarget} wins.`;
}

function checkWinner() {
    for (const line of WINNING_LINES) {
        const [a, b, c] = line;
        const first = boxes[a].textContent;
        const second = boxes[b].textContent;
        const third = boxes[c].textContent;

        if (first && first === second && second === third) {
            return { mark: first, line };
        }
    }

    return null;
}

function checkDraw() {
    return [...boxes].every((box) => box.textContent !== "");
}

function finishRound(message, winningLine = null) {
    gameLocked = true;
    setStatus(message);
    if (winningLine) {
        winningLine.forEach((index) => boxes[index].classList.add("winning-box"));
    }
    setBoardLocked(true);
}

function handleWin(winnerMark, winningLine) {
    const winnerName = getNameForMark(winnerMark);
    if (winnerMark === "O") {
        scores.player1 += 1;
        series.player1 += 1;
        finishRound(`The winner is ${winnerName} (O)`, winningLine);
    } else {
        scores.player2 += 1;
        series.player2 += 1;
        finishRound(`The winner is ${winnerName} (X)`, winningLine);
    }
    playWinSound();
    updateScoreboard();
    updateMatchStatus();

    if (series.player1 >= matchTarget || series.player2 >= matchTarget) {
        matchOver = true;
        gameLocked = true;
        container.classList.add("match-over");
        rematchButton.textContent = "New Match";
        setStatus(series.player1 >= matchTarget
            ? `${getNameForMark("O")} wins the match!`
            : `${getNameForMark("X")} wins the match!`);
        updateMatchStatus();
        setBoardLocked(true);
    }
}

function handleDraw() {
    scores.draws += 1;
    playDrawSound();
    updateScoreboard();
    finishRound("It is a draw. Play again or reset scores.");
    updateMatchStatus();
}

function resetBoard() {
    boxes.forEach((box) => {
        box.textContent = "";
        box.disabled = false;
    });
    clearWinningHighlight();
    container.classList.remove("match-over");
    currentMark = "O";
    gameLocked = false;
    rematchButton.textContent = "Play Again";
    updateMatchStatus();
    updateTurnMessage();
}

function startNewMatch() {
    series.player1 = 0;
    series.player2 = 0;
    matchOver = false;
    updateMatchStatus();
    resetBoard();
}

function resetMatch() {
    scores.player1 = 0;
    scores.player2 = 0;
    scores.draws = 0;
    series.player1 = 0;
    series.player2 = 0;
    matchOver = false;
    updateScoreboard();
    resetBoard();
}

boxes.forEach((box) => {
    box.addEventListener("click", () => {
        if (gameLocked || box.textContent !== "") {
            return;
        }

        box.textContent = currentMark;
        box.disabled = true;
        playMoveSound(currentMark);

        const winner = checkWinner();
        if (winner) {
            handleWin(winner.mark, winner.line);
            return;
        }

        if (checkDraw()) {
            handleDraw();
            return;
        }

        currentMark = currentMark === "O" ? "X" : "O";
        updateTurnMessage();
        updateMatchStatus();
    });
});

rematchButton.addEventListener("click", () => {
    if (matchOver) {
        startNewMatch();
    } else {
        resetBoard();
    }
});
resetScoresButton.addEventListener("click", resetMatch);
player1Input.addEventListener("input", () => {
    updateScoreboard();
    updateMatchStatus();
    if (!gameLocked) {
        updateTurnMessage();
    }
});
player2Input.addEventListener("input", () => {
    updateScoreboard();
    updateMatchStatus();
    if (!gameLocked) {
        updateTurnMessage();
    }
});

updateScoreboard();
resetBoard();


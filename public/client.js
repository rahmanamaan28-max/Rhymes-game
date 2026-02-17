const socket = io();
let roomCode = "";
let username = "";
let currentRoom = null;
let isMyTurn = false;

const app = document.getElementById("app");

const quackSound = new Audio("https://actions.google.com/sounds/v1/animals/duck_quack.ogg");
const winSound = new Audio("https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg");

function renderLayout(content, bottom = "") {
  app.innerHTML = `
    <div class="header">🦆 RHYMES QUACK</div>
    <div class="content">${content}</div>
    ${bottom}
  `;
}

function showLobby() {
  renderLayout(`
    <div class="card">
      <input id="username" placeholder="Enter Username"/>
      <button onclick="createRoom()">Host New Room</button>
      <input id="roomCode" placeholder="Room Code"/>
      <button onclick="joinRoom()">Join Room</button>
    </div>
  `);
}

function createRoom() {
  username = document.getElementById("username").value;
  socket.emit("create_room", username);
}

function joinRoom() {
  username = document.getElementById("username").value;
  roomCode = document.getElementById("roomCode").value;
  socket.emit("join_room", { code: roomCode, username });
}

socket.on("room_created", code => {
  roomCode = code;
  renderLayout(`
    <div class="card">
      <h3>Room Code: ${code}</h3>
      <button onclick="startPoints()">Points Mode</button>
      <button onclick="startRounds()">Rounds Mode</button>
    </div>
  `);
});

function startPoints() {
  socket.emit("start_game", { code: roomCode, mode: "points", rounds: 0 });
}

function startRounds() {
  const rounds = prompt("Number of Rounds:");
  socket.emit("start_game", { code: roomCode, mode: "rounds", rounds });
}

socket.on("phase", room => {
  currentRoom = room;
  renderGame(room);
});

socket.on("timer", t => {
  const timerEl = document.getElementById("timer");
  if (timerEl) timerEl.innerText = "⏳ " + t;
});

socket.on("reveal", room => {
  renderReveal(room);
});

socket.on("game_end", winner => {
  winSound.play();
  renderLayout(`
    <div class="card">
      <h2>🏆 ${winner.username} Wins!</h2>
      <button onclick="location.reload()">Play Again</button>
    </div>
  `);
});

function renderGame(room) {
  const me = room.players.find(p => p.id === socket.id);
  isMyTurn = (room.phase === "chuck_word" && me.isChuck) ||
             (room.phase === "rhyme" && !me.isChuck);

  let players = "";
  room.players.forEach(p => {
    const quack = p.quackIndex ? "QUACK".slice(0, p.quackIndex) : "";
    players += `
      <div class="player ${p.isChuck ? "chuck" : ""}">
        <div>${p.isChuck ? "🦆 " : ""}${p.username}</div>
        <div>${p.score} pts<br><span class="quack">${quack}</span></div>
      </div>
    `;
  });

  renderLayout(`
    <div class="timer" id="timer">⏳ ${room.timer}</div>
    <div class="word-display">
      ${room.currentWord || "Waiting for Chuck..."}
    </div>
    ${players}
  `,
  `
    <div class="bottom-input">
      <input id="input" placeholder="${isMyTurn ? "Your turn..." : "Waiting..."}" ${isMyTurn ? "" : "disabled"}/>
      <button onclick="submit()" ${isMyTurn ? "" : "disabled"}>Send</button>
    </div>
  `);
}

function submit() {
  if (!isMyTurn) return;

  const val = document.getElementById("input").value;
  if (!val) return;

  if (currentRoom.phase === "chuck_word") {
    socket.emit("submit_word", { code: roomCode, word: val });
  } else {
    socket.emit("submit_answer", { code: roomCode, answer: val });
  }

  document.getElementById("input").value = "";
}

function renderReveal(room) {
  let answers = "";
  for (let id in room.answers) {
    const p = room.players.find(x => x.id === id);
    answers += `
      <div class="card answer-reveal">
        <b>${p.username}</b><br>
        ${room.answers[id]}
      </div>
    `;
  }

  quackSound.play();

  renderLayout(`
    <div class="word-display">${room.currentWord}</div>
    ${answers}
  `);
}

showLobby();

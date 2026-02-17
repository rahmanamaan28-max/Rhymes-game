const socket = io();
let roomCode = "";
let username = "";
let currentRoom = null;

const app = document.getElementById("app");

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
      <div><b>Room Code:</b> ${code}</div>
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
  renderLayout(`
    <div class="card">
      <h2>🏆 Winner</h2>
      <div>${winner.username}</div>
      <button onclick="location.reload()">Play Again</button>
    </div>
  `);
});

function renderGame(room) {
  let players = "";
  room.players.forEach(p => {
    players += `
      <div class="player ${p.isChuck ? "chuck" : ""}">
        <div>${p.isChuck ? "🦆 " : ""}${p.username}</div>
        <div>${p.score} pts</div>
      </div>
    `;
  });

  renderLayout(`
    <div class="timer" id="timer">⏳ ${room.timer}</div>
    <div class="word-display">
      ${room.currentWord || "Waiting for Chuck..."}
    </div>
    <div class="scoreboard">${players}</div>
  `,
  `
    <div class="bottom-input">
      <input id="input" placeholder="Type here..."/>
      <button onclick="submit()">Send</button>
    </div>
  `);
}

function submit() {
  const val = document.getElementById("input").value;

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
      <div class="card">
        <b>${p.username}</b><br>
        ${room.answers[id]}
      </div>
    `;
  }

  renderLayout(`
    <div class="word-display">${room.currentWord}</div>
    ${answers}
  `);
}

showLobby();

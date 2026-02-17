const socket = io();
let roomCode = "";
let username = "";

const app = document.getElementById("app");

function showLobby() {
  app.innerHTML = `
    <h1>🦆 RHYMES QUACK</h1>
    <input id="username" placeholder="Username"/>
    <button onclick="createRoom()">Host</button>
    <input id="roomCode" placeholder="Room Code"/>
    <button onclick="joinRoom()">Join</button>
  `;
}

function createRoom(){
  username=document.getElementById("username").value;
  socket.emit("create_room", username);
}

function joinRoom(){
  username=document.getElementById("username").value;
  roomCode=document.getElementById("roomCode").value;
  socket.emit("join_room",{code:roomCode,username});
}

socket.on("room_created", code=>{
  roomCode=code;
  app.innerHTML=`Room Code: ${code}<br>
  <button onclick="startPoints()">Points Mode</button>
  <button onclick="startRounds()">Rounds Mode</button>`;
});

function startPoints(){
  socket.emit("start_game",{code:roomCode,mode:"points",rounds:0});
}

function startRounds(){
  const rounds=prompt("How many rounds?");
  socket.emit("start_game",{code:roomCode,mode:"rounds",rounds});
}

socket.on("phase", room=>{
  renderGame(room);
});

socket.on("timer", t=>{
  document.getElementById("timer").innerText="⏳ "+t;
});

socket.on("reveal", room=>{
  renderReveal(room);
});

socket.on("game_end", winner=>{
  app.innerHTML=`🏆 Winner: ${winner.username}<br>
  <button onclick="location.reload()">Play Again</button>`;
});

function renderGame(room){
  let players="";
  room.players.forEach(p=>{
    players+=`<div class="${p.isChuck?'chuck':''}">
    ${p.isChuck?'🦆':''}${p.username} - ${p.score} pts
    </div>`;
  });

  app.innerHTML=`
  <h2>Word: ${room.currentWord||"Waiting..."}</h2>
  <div id="timer">⏳ ${room.timer}</div>
  <input id="input"/>
  <button onclick="submit()">Send</button>
  <div class="scoreboard">${players}</div>
  `;
}

function submit(){
  const val=document.getElementById("input").value;
  socket.emit("submit_answer",{code:roomCode,answer:val});
}

function renderReveal(room){
  let answers="";
  for(let id in room.answers){
    const p=room.players.find(x=>x.id===id);
    answers+=`<div>${p.username}: ${room.answers[id]}</div>`;
  }
  app.innerHTML=`<h2>${room.currentWord}</h2>${answers}`;
}

showLobby();

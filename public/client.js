const socket=io();
let roomCode="";
let username="";
let currentRoom=null;
let submitted = false;

const app=document.getElementById("app");

function render(content,bottom=""){
  app.innerHTML=`
  <div class="header">🦆 RHYMES QUACK</div>
  <div class="content">${content}</div>
  ${bottom}
  `;
}

function showLobby(){
  render(`
  <div class="card">
    <input id="username" placeholder="Username"/>
    <button onclick="createRoom()">Host Room</button>
    <input id="roomCode" placeholder="Room Code"/>
    <button onclick="joinRoom()">Join Room</button>
  </div>
  `);
}

function createRoom(){
  username=document.getElementById("username").value;
  socket.emit("create_room",username);
}

function joinRoom(){
  username=document.getElementById("username").value;
  roomCode=document.getElementById("roomCode").value;
  socket.emit("join_room",{code:roomCode,username});
}

socket.on("room_created",code=>{
  roomCode=code;
  render(`
  <div class="card">
    Room Code: ${code}
    <button onclick="startPoints()">Points Mode</button>
    <button onclick="startRounds()">Rounds Mode</button>
  </div>
  `);
});

function startPoints(){
  socket.emit("start_game",{code:roomCode,mode:"points"});
}
function startRounds(){
  const r=prompt("Rounds?");
  socket.emit("start_game",{code:roomCode,mode:"rounds",rounds:r});
}

socket.on("phase",room=>{
  currentRoom=room;
  renderGame(room);
});

socket.on("timer",t=>{
  const el=document.getElementById("timer");
  if(el) el.innerText="⏳ "+t;
});

socket.on("reveal",data=>{

  const {currentWord,answers,players,roundPoints} = data;

  let html = `
    <h2>${currentWord}</h2>
  `;

  for(let id in answers){
    const p = players.find(x=>x.id===id);

    html += `
      <div class="card">
        ${p.avatar} <b>${p.username}</b>: 
        ${answers[id]}
        <span style="color:#4caf50;">
          +${roundPoints[id]||0}
        </span>
      </div>
    `;
  }

  render(html);
});

socket.on("game_end",winner=>{
  confetti({particleCount:200,spread:100});
  render(`<div class="card">🏆 ${winner.username} Wins!</div>
  <button onclick="location.reload()">Play Again</button>`);
});

function renderGame(room){
  let players="";
  room.players.forEach((p,index)=>{
  players+=`
    <div class="player ${p.isChuck?"chuck":""}">
      <span>
        #${index+1} ${p.avatar} 
        ${p.isChuck?"🦆 ":""}${p.username}
      </span>
      <span>${p.score}</span>
    </div>
  `;
});

  render(`
  <div>Mode: ${room.mode} | Round ${room.currentRound}</div>
  <div id="timer">⏳ ${room.timeLeft}</div>
  <div class="card"><h2>${room.currentWord}</h2></div>
  ${players}
  `,
  `
  <div class="bottom-input">
    <input id="input"/>
    <button onclick="submit()">Send</button>
  </div>
  `);
}

let submitted = false;

function submit(){

  if(submitted) return;

  const val = document.getElementById("input").value;
  if(!val) return;

  socket.emit("submit_answer",{code:roomCode,answer:val});

  submitted = true;

  const input = document.getElementById("input");
  input.disabled = true;
  input.value = "Answer submitted ✔";
}

showLobby();

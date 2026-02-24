const socket=io();
let roomCode="";
let username="";
let avatar="";
let currentRoom=null;
let submitted=false;

const AVATARS=["🦊","🐼","🐵","🐸","🦁","🐯","🐨","🐰","🐻","🦄","🐙","🐢"];

function randomAvatar(){
  return AVATARS[Math.floor(Math.random()*AVATARS.length)];
}

const app=document.getElementById("app");

function render(content,bottom=""){
  app.innerHTML=`
  <div class="header">🦆 RHYMES QUACK</div>
  <div class="content">${content}</div>
  ${bottom}
  `;
}

function showLobby(){
  avatar=randomAvatar();
  render(`
    <div style="text-align:center;font-size:30px;">${avatar}</div>
    <input id="username" placeholder="Username"/>
    <button onclick="createRoom()">Host</button>
    <input id="roomCode" placeholder="Room Code"/>
    <button onclick="joinRoom()">Join</button>
  `);
}

function createRoom(){
  username=document.getElementById("username").value;
  socket.emit("create_room",{username,avatar});
}

function joinRoom(){
  username=document.getElementById("username").value;
  roomCode=document.getElementById("roomCode").value;
  socket.emit("join_room",{code:roomCode,username,avatar});
}

socket.on("room_created",code=>{
  roomCode=code;
  render(`
    Room: ${code}
    <button onclick="startPoints()">Points Mode</button>
    <button onclick="startRounds()">Rounds Mode</button>
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
  submitted=false;
  renderGame(room);
});

socket.on("timer",t=>{
  const el=document.getElementById("timer");
  if(el) el.innerText="⏳ "+t;
});

socket.on("reveal",data=>{
  const {currentWord,answers,players,roundPoints}=data;
  let html=`<h2>${currentWord}</h2>`;
  for(let id in answers){
    const p=players.find(x=>x.id===id);
    html+=`
      <div style="position:relative;">
        ${p.avatar} <b>${p.username}</b>: ${answers[id]}
        <div class="float-points">+${roundPoints[id]||0}</div>
      </div>
    `;
  }
  render(html);
});

socket.on("game_end",data=>{
  const players=data.players;
  let html=`
  <div class="podium">
    <div class="gold">🥇 ${players[0]?.avatar} ${players[0]?.username}</div>
    <div class="silver">🥈 ${players[1]?.avatar||""} ${players[1]?.username||""}</div>
    <div class="bronze">🥉 ${players[2]?.avatar||""} ${players[2]?.username||""}</div>
    <br><br>
  `;
  players.forEach(p=>{
    html+=`${p.avatar} ${p.username} | Score: ${p.score} | ELO: ${p.elo}<br>`;
  });
  html+=`</div><button onclick="location.reload()">Play Again</button>`;
  confetti({particleCount:300,spread:120});
  render(html);
});

function renderGame(room){
  let players="";
  room.players.forEach((p,index)=>{
    players+=`
      <div class="player ${p.isChuck?"chuck":""}">
        #${index+1} ${p.avatar} ${p.isChuck?"🦆 ":""}${p.username}
        <span>${p.score}</span>
      </div>`;
  });

  render(`
    <div>Mode: ${room.mode} | Round ${room.currentRound}</div>
    <div id="timer">⏳ ${room.timeLeft}</div>
    <h2>${room.currentWord}</h2>
    ${players}
  `,
  `
    <div class="bottom-input">
      <input id="input"/>
      <button onclick="submit()">Send</button>
    </div>
  `);
}

function submit(){
  if(submitted) return;
  const val=document.getElementById("input").value;
  if(!val) return;
  socket.emit("submit_answer",{code:roomCode,answer:val});
  submitted=true;
  const input=document.getElementById("input");
  input.disabled=true;
  input.value="Submitted ✔";
}

showLobby();

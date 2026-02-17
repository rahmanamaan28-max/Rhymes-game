const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getAlivePlayers(room) {
  return room.players.filter(p => !p.eliminated);
}

function selectRandomChuck(room) {
  const alive = getAlivePlayers(room);
  return alive[Math.floor(Math.random() * alive.length)];
}

function resetRound(room) {
  room.currentWord = null;
  room.answers = {};
  room.phase = "chuck_word";
  room.timer = 20;

  room.players.forEach(p => {
    p.answer = null;
    p.isChuck = false;
  });

  const chuck = selectRandomChuck(room);
  chuck.isChuck = true;
  room.chuckId = chuck.id;
}

function calculateScores(room) {
  const groups = {};

  for (let id in room.answers) {
    const ans = room.answers[id].toLowerCase();
    if (!groups[ans]) groups[ans] = [];
    groups[ans].push(id);
  }

  Object.values(groups).forEach(group => {
    const count = group.length;

    if (count === 1) {
      const player = room.players.find(p => p.id === group[0]);
      if (room.mode === "points") {
        player.quackIndex++;
        if (player.quackIndex >= 5) player.eliminated = true;
      }
      return;
    }

    group.forEach(id => {
      const player = room.players.find(p => p.id === id);

      if (count === 2) player.score += 3;
      else player.score += 1;

      if (player.id === room.chuckId)
        player.score += (count - 1);

      if (group.includes(room.chuckId) && player.id !== room.chuckId)
        player.score += 2;
    });
  });
}

function checkWin(room) {
  if (room.mode === "points") {
    const winner = room.players.find(p => p.score >= 20);
    if (winner) return winner;

    const alive = getAlivePlayers(room);
    if (alive.length === 1) return alive[0];
  }

  if (room.mode === "rounds" && room.currentRound >= room.maxRounds) {
    return room.players.sort((a,b)=>b.score-a.score)[0];
  }

  return null;
}

function startTimer(roomCode) {
  const room = rooms[roomCode];
  const interval = setInterval(() => {
    if (!rooms[roomCode]) return clearInterval(interval);

    room.timer--;
    io.to(roomCode).emit("timer", room.timer);

    if (room.timer <= 0) {
      nextPhase(roomCode);
    }
  }, 1000);
}

function nextPhase(roomCode) {
  const room = rooms[roomCode];

  if (room.phase === "chuck_word") {
    room.phase = "rhyme";
    room.timer = 20;
    io.to(roomCode).emit("phase", room);
    return;
  }

  if (room.phase === "rhyme") {
    room.phase = "reveal";
    calculateScores(room);
    io.to(roomCode).emit("reveal", room);

    const winner = checkWin(room);
    if (winner) {
      room.phase = "ended";
      io.to(roomCode).emit("game_end", winner);
      return;
    }

    room.currentRound++;
    setTimeout(() => {
      resetRound(room);
      io.to(roomCode).emit("phase", room);
      startTimer(roomCode);
    }, 5000);
  }
}

io.on("connection", socket => {

  socket.on("create_room", (username) => {
    const code = generateRoomCode();
    rooms[code] = {
      players: [],
      hostId: socket.id,
      mode: null,
      maxRounds: 0,
      currentRound: 0,
      phase: "lobby"
    };

    socket.join(code);
    rooms[code].players.push({
      id: socket.id,
      username,
      score: 0,
      quackIndex: 0,
      eliminated: false
    });

    socket.emit("room_created", code);
  });

  socket.on("join_room", ({ code, username }) => {
    if (!rooms[code]) return;

    socket.join(code);
    rooms[code].players.push({
      id: socket.id,
      username,
      score: 0,
      quackIndex: 0,
      eliminated: false
    });

    io.to(code).emit("room_update", rooms[code]);
  });

  socket.on("start_game", ({ code, mode, rounds }) => {
    const room = rooms[code];
    room.mode = mode;
    room.maxRounds = rounds;
    room.currentRound = 1;

    room.players.forEach(p=>{
      p.score=0;
      p.quackIndex=0;
      p.eliminated=false;
    });

    resetRound(room);
    io.to(code).emit("phase", room);
    startTimer(code);
  });

  socket.on("submit_word", ({ code, word }) => {
    const room = rooms[code];
    if (room.phase !== "chuck_word") return;

    room.currentWord = word;
    nextPhase(code);
    startTimer(code);
  });

  socket.on("submit_answer", ({ code, answer }) => {
    const room = rooms[code];
    if (!room.answers) room.answers = {};

    room.answers[socket.id] = answer;

    const aliveCount = getAlivePlayers(room).length;
    if (Object.keys(room.answers).length === aliveCount) {
      nextPhase(code);
    }
  });

  socket.on("disconnect", ()=>{
    for (let code in rooms) {
      const room = rooms[code];
      room.players = room.players.filter(p=>p.id!==socket.id);
      io.to(code).emit("room_update", room);
    }
  });
});

server.listen(3000, ()=>console.log("Server running on 3000"));

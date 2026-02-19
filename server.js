const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

/* ============================= */
/* WORD BANK + DIFFICULTY       */
/* ============================= */

const WORD_BANK = {
  easy: ["CAT","DOG","SUN","MOON","CAR","STAR","TREE","BALL","FISH","BOOK","HOUSE","DOOR","FLOOR","PLANE","WAVE"],
  medium: ["RIVER","MAYOR","CANDLE","GARDEN","FLOWER","SILVER","TIGER","HUNGER","WATER","POCKET","MARKET","HERO"],
  hard: ["ORANGE","PURPLE","CHAOS","RHYTHM","GHOST","DEPTH","WORLD","HEIGHT","BRIDGE","THOUGHT"],
  expert: ["LUXURY","MEMORY","ENERGY","CATEGORY","VICTORY","MYSTERY","STRATEGY","TRAGEDY"]
};

function updateDifficulty(room) {
  const r = room.currentRound;
  if (r <= 3) room.difficulty = "easy";
  else if (r <= 6) room.difficulty = "medium";
  else if (r <= 9) room.difficulty = "hard";
  else room.difficulty = "expert";
}

function generateWord(room) {
  updateDifficulty(room);
  const pool = WORD_BANK[room.difficulty];
  const available = pool.filter(w => !room.usedWords.includes(w));
  if (available.length === 0) {
    room.usedWords = [];
    return generateWord(room);
  }
  const word = available[Math.floor(Math.random() * available.length)];
  room.usedWords.push(word);
  return word;
}

/* ============================= */
/* UTILITIES                     */
/* ============================= */

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

/* ============================= */
/* ROUND SYSTEM                  */
/* ============================= */

function startNewRound(code) {
  const room = rooms[code];
  if (!room || !room.gameActive) return;

  room.phase = "rhyme";
  room.answers = {};
  room.timeLeft = 20;
  room.roundInProgress = true;

  room.players.forEach(p => {
    p.isChuck = false;
  });

  const chuck = selectRandomChuck(room);
  chuck.isChuck = true;
  room.chuckId = chuck.id;

  room.currentWord = generateWord(room);

  io.to(code).emit("phase", room);
  startTimer(code);
}

function finishRound(code) {
  const room = rooms[code];
  if (!room || !room.gameActive) return;

  calculateScores(room);
  room.phase = "reveal";
  io.to(code).emit("reveal", room);

  clearRoomTimer(room);

  setTimeout(() => {
    handleRoundCompletion(code);
  }, 4000);
}

function handleRoundCompletion(code) {
  const room = rooms[code];
  if (!room || !room.gameActive) return;

  if (room.mode === "points") {
    const winner = room.players.find(p => p.score >= 20);
    const alive = getAlivePlayers(room);

    if (winner) return endGame(code, winner);
    if (alive.length === 1) return endGame(code, alive[0]);

    room.currentRound++;
    return startNewRound(code);
  }

  if (room.mode === "rounds") {
    if (room.currentRound >= room.maxRounds) {
      const winner = room.players.sort((a,b)=>b.score-a.score)[0];
      return endGame(code, winner);
    }
    room.currentRound++;
    return startNewRound(code);
  }
}

/* ============================= */
/* SCORING                       */
/* ============================= */

function calculateScores(room) {
  const groups = {};

  for (let id in room.answers) {
    const ans = room.answers[id];
    if (!groups[ans]) groups[ans] = [];
    groups[ans].push(id);
  }

  Object.values(groups).forEach(group => {
    const count = group.length;

    if (count === 1) {
      const p = room.players.find(x=>x.id===group[0]);
      if (room.mode === "points") {
        p.quackIndex++;
        if (p.quackIndex >= 5) p.eliminated = true;
      }
      return;
    }

    group.forEach(id => {
      const player = room.players.find(p=>p.id===id);
      if (count === 2) player.score += 3;
      else player.score += 1;

      if (player.id === room.chuckId)
        player.score += (count - 1);

      if (group.includes(room.chuckId) && player.id !== room.chuckId)
        player.score += 2;
    });
  });
}

/* ============================= */
/* TIMER                         */
/* ============================= */

function startTimer(code) {
  const room = rooms[code];
  if (!room) return;

  clearRoomTimer(room);

  room.timer = setInterval(() => {
    if (!room.gameActive) return clearRoomTimer(room);

    room.timeLeft--;
    io.to(code).emit("timer", room.timeLeft);

    if (room.timeLeft <= 0) {
      clearRoomTimer(room);
      finishRound(code);
    }

  }, 1000);
}

function clearRoomTimer(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
}

/* ============================= */
/* END GAME                      */
/* ============================= */

function endGame(code, winner) {
  const room = rooms[code];
  if (!room) return;

  room.gameActive = false;
  clearRoomTimer(room);

  io.to(code).emit("game_end", winner);
}

/* ============================= */
/* SOCKET LOGIC                  */
/* ============================= */

io.on("connection", socket => {

  socket.on("create_room", username => {
    const code = generateRoomCode();

    rooms[code] = {
      players: [],
      hostId: socket.id,
      mode: null,
      maxRounds: 0,
      currentRound: 0,
      phase: "lobby",
      usedWords: [],
      difficulty: "easy",
      timer: null,
      answers: {},
      gameActive: false
    };

    socket.join(code);

    rooms[code].players.push({
      id: socket.id,
      username,
      score: 0,
      quackIndex: 0,
      eliminated: false,
      isChuck: false
    });

    socket.emit("room_created", code);
  });

  socket.on("join_room", ({code, username}) => {
    const room = rooms[code];
    if (!room) return;

    socket.join(code);

    room.players.push({
      id: socket.id,
      username,
      score: 0,
      quackIndex: 0,
      eliminated: false,
      isChuck: false
    });

    io.to(code).emit("room_update", room);
  });

  socket.on("start_game", ({code, mode, rounds}) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) return;

    room.mode = mode;
    room.maxRounds = mode === "rounds" ? parseInt(rounds) : Infinity;
    room.currentRound = 1;
    room.usedWords = [];
    room.gameActive = true;

    room.players.forEach(p=>{
      p.score = 0;
      p.quackIndex = 0;
      p.eliminated = false;
    });

    startNewRound(code);
  });

  socket.on("submit_answer", ({code, answer}) => {
    const room = rooms[code];
    if (!room || room.phase !== "rhyme") return;

    const player = room.players.find(p=>p.id===socket.id);
    if (!player || player.eliminated) return;
    if (room.answers[socket.id]) return;

    answer = answer?.trim().toUpperCase();
    if (!answer || answer === room.currentWord) return;

    room.answers[socket.id] = answer;

    const alive = getAlivePlayers(room).length;

    if (Object.keys(room.answers).length >= alive) {
      finishRound(code);
    }
  });

  socket.on("disconnect", () => {
    for (let code in rooms) {
      const room = rooms[code];
      const index = room.players.findIndex(p=>p.id===socket.id);
      if (index === -1) continue;

      const wasHost = room.hostId === socket.id;

      room.players.splice(index,1);

      if (room.players.length === 0) {
        clearRoomTimer(room);
        delete rooms[code];
        continue;
      }

      if (wasHost) {
        room.hostId = room.players[0].id;
        io.to(code).emit("new_host", room.hostId);
      }

      if (room.gameActive && room.phase==="rhyme") {
        const alive = getAlivePlayers(room).length;
        if (Object.keys(room.answers).length >= alive)
          finishRound(code);
      }
    }
  });

});

/* Auto-clean empty rooms */
setInterval(()=>{
  for (let code in rooms) {
    if (rooms[code].players.length===0)
      delete rooms[code];
  }
},600000);

server.listen(3000, ()=>console.log("Server running on 3000"));

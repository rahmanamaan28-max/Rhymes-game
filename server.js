const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};
const AVATARS = ["🦊","🐼","🐵","🐸","🦁","🐯","🐨","🐰","🐻","🦄","🐙","🐢"];

/* ================= WORD SYSTEM ================= */

const WORD_BANK = {
  easy:["CAT","DOG","SUN","MOON","CAR","STAR","TREE","BALL","FISH","BOOK"],
  medium:["RIVER","MAYOR","FLOWER","SILVER","HUNGER","MARKET"],
  hard:["ORANGE","PURPLE","CHAOS","RHYTHM","DEPTH"],
  expert:["LUXURY","MEMORY","ENERGY","MYSTERY","STRATEGY"]
};

function updateDifficulty(room){
  if(room.currentRound<=3) room.difficulty="easy";
  else if(room.currentRound<=6) room.difficulty="medium";
  else if(room.currentRound<=9) room.difficulty="hard";
  else room.difficulty="expert";
}

function generateWord(room){
  updateDifficulty(room);
  const pool=WORD_BANK[room.difficulty];
  const available=pool.filter(w=>!room.usedWords.includes(w));
  if(available.length===0){
    room.usedWords=[];
    return generateWord(room);
  }
  const word=available[Math.floor(Math.random()*available.length)];
  room.usedWords.push(word);
  return word;
}

/* ================= UTILITIES ================= */

function generateRoomCode(){
  return Math.random().toString(36).substring(2,8).toUpperCase();
}

function getAlivePlayers(room){
  return room.players.filter(p=>!p.eliminated);
}

function selectRandomChuck(room){
  const alive=getAlivePlayers(room);
  return alive[Math.floor(Math.random()*alive.length)];
}

/* ================= ROUND SYSTEM ================= */

function startNewRound(code){
  const room=rooms[code];
  if(!room||!room.gameActive) return;

  room.phase="rhyme";
  room.answers={};
  room.timeLeft=20;

  room.players.forEach(p=>{
    p.isChuck=false;
  });

  const chuck=selectRandomChuck(room);
  chuck.isChuck=true;
  room.chuckId=chuck.id;

  room.currentWord=generateWord(room);

  io.to(code).emit("phase",room);
  startTimer(code);
}

function finishRound(code){
  const room=rooms[code];
  if(!room||!room.gameActive) return;

  calculateScores(room);
  room.phase="reveal";

  io.to(code).emit("reveal",{
    currentWord:room.currentWord,
    answers:room.answers,
    players:room.players,
    roundPoints:room.roundPoints
  });

  clearTimer(room);

  setTimeout(()=>handleRoundCompletion(code),4000);
}

function handleRoundCompletion(code){
  const room=rooms[code];
  if(!room||!room.gameActive) return;

  if(room.mode==="points"){
    const winner=room.players.find(p=>p.score>=20);
    const alive=getAlivePlayers(room);
    if(winner) return endGame(code);
    if(alive.length===1) return endGame(code);

    room.currentRound++;
    startNewRound(code);
  }

  if(room.mode==="rounds"){
    if(room.currentRound>=room.maxRounds){
      return endGame(code);
    }
    room.currentRound++;
    startNewRound(code);
  }
}

/* ================= SCORING ================= */

function calculateScores(room){

  const groups={};
  const roundPoints={};

  room.players.forEach(p=>{
    roundPoints[p.id]=0;
    if(!p.streak) p.streak=0;
  });

  for(let id in room.answers){
    const ans=room.answers[id];
    if(!groups[ans]) groups[ans]=[];
    groups[ans].push(id);
  }

  Object.values(groups).forEach(group=>{
    const count=group.length;

    if(count===1){
      const player=room.players.find(p=>p.id===group[0]);
      player.streak=0;
      if(room.mode==="points"){
        player.quackIndex++;
        if(player.quackIndex>=5)
          player.eliminated=true;
      }
      return;
    }

    group.forEach(id=>{
      const p=room.players.find(x=>x.id===id);
      let gained=(count===2)?3:1;

      if(count>=3)
        gained=Math.floor(gained*1.5); // combo multiplier

      if(id===room.chuckId)
        gained+=(count-1);

      if(group.includes(room.chuckId)&&id!==room.chuckId)
        gained+=2;

      p.streak++;
      if(p.streak===2) gained+=1;
      if(p.streak>=3) gained+=2;

      p.score+=gained;
      roundPoints[id]+=gained;
    });
  });

  room.roundPoints=roundPoints;

  room.players.sort((a,b)=>b.score-a.score);
}

/* ================= TIMER ================= */

function startTimer(code){
  const room=rooms[code];
  if(!room) return;

  clearTimer(room);

  room.timer=setInterval(()=>{
    if(!room.gameActive) return clearTimer(room);

    room.timeLeft--;
    io.to(code).emit("timer",room.timeLeft);

    if(room.timeLeft<=0){
      clearTimer(room);
      finishRound(code);
    }
  },1000);
}

function clearTimer(room){
  if(room.timer){
    clearInterval(room.timer);
    room.timer=null;
  }
}

/* ================= ELO ================= */

function applyELO(room){
  room.players.forEach((p,index)=>{
    if(!p.elo) p.elo=1000;

    if(index===0) p.elo+=25;
    else if(index===1) p.elo+=10;
    else if(index===2) p.elo+=5;
    else p.elo-=10;

    if(p.elo<0) p.elo=0;
  });
}

function endGame(code){
  const room=rooms[code];
  if(!room) return;

  applyELO(room);

  room.gameActive=false;
  clearTimer(room);

  io.to(code).emit("game_end",{players:room.players});
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Правила для игр (для "mafia" minPlayers можно временно снизить для теста)
const gameRules = {
  mafia: { minPlayers: 2, maxPlayers: 12 },
  bunker: { minPlayers: 3, maxPlayers: 8 },
  'truth-or-dare': { minPlayers: 2, maxPlayers: 10 },
  court: { minPlayers: 3, maxPlayers: 8 }
};

// Объект для хранения комнат в памяти
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Создание комнаты
  socket.on('createRoom', ({ gameId, name }) => {
    if (!gameRules[gameId]) {
      socket.emit('error', 'Unsupported game id');
      return;
    }
    if (!name || name.trim() === '') {
      socket.emit('error', 'Name is required for creating a room');
      return;
    }
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      gameId,
      players: [{ id: socket.id, name: name.trim(), isHost: true }],
      gameState: { phase: 'waiting' }
    };
    socket.join(roomCode);
    socket.emit('roomJoinedSuccessfully', {
      roomCode,
      players: rooms[roomCode].players.map(p => ({ name: p.name, isHost: p.isHost })),
      isHost: true,
      gameId
    });
    console.log(`Room ${roomCode} created by ${name} for game ${gameId}`);
  });

  // Присоединение к комнате
  socket.on('joinRoom', ({ roomCode, name }) => {
    if (!name || name.trim() === '') {
      socket.emit('error', 'Name is required to join a room');
      return;
    }
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    const { maxPlayers } = gameRules[room.gameId];
    if (room.players.length >= maxPlayers) {
      socket.emit('error', 'Room is full');
      return;
    }
    room.players.push({ id: socket.id, name: name.trim(), isHost: false });
    socket.join(roomCode);
    socket.emit('roomJoinedSuccessfully', {
      roomCode,
      players: room.players.map(p => ({ name: p.name, isHost: p.isHost })),
      isHost: false,
      gameId: room.gameId
    });
    io.in(roomCode).emit('playerListUpdate', {
      players: room.players.map(p => ({ name: p.name, isHost: p.isHost }))
    });
    console.log(`${name} joined room ${roomCode}`);
  });

  // Запуск игры
  socket.on('startGame', ({ roomCode }) => {
    console.log("DEBUG: Received startGame event from", socket.id, "with roomCode =", roomCode);
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    const currentPlayer = room.players.find(p => p.id === socket.id);
    console.log("DEBUG: currentPlayer =", currentPlayer);
    if (!currentPlayer || !currentPlayer.isHost) {
      socket.emit('error', 'Only the host can start the game.');
      console.log("DEBUG: Not a host. isHost =", currentPlayer?.isHost);
      return;
    }
    const { minPlayers } = gameRules[room.gameId];
    if (room.players.length < minPlayers) {
      socket.emit('error', `Not enough players. Minimum required: ${minPlayers}`);
      console.log("DEBUG: Not enough players. Have", room.players.length, "need", minPlayers);
      return;
    }
    if (room.gameId === 'mafia') {
      console.log("DEBUG: Starting mafia game for room", roomCode);
      startMafiaGame(roomCode);
      // Отправляем событие gameStarted для перехода в игру
      io.in(roomCode).emit('gameStarted', { roomCode, message: 'Mafia game has been started!', gameId: 'mafia' });
    } else {
      console.log("DEBUG: Non-mafia game started for room", roomCode);
      io.in(roomCode).emit('gameStarted', { roomCode, message: 'Game has been started!', gameId: room.gameId });
    }
  });

  // Ночные действия для "Мафии"
  socket.on('mafiaAction', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.gameState.phase !== 'night') return;
    if (!room.gameState.actions.mafiaVotes) {
      room.gameState.actions.mafiaVotes = {};
    }
    room.gameState.actions.mafiaVotes[socket.id] = targetId;
    console.log(`Mafia vote in room ${roomCode}: ${socket.id} voted for ${targetId}`);
    if (checkMafiaVotesComplete(room)) {
      clearTimeout(room.gameState.nightTimer);
      resolveNightActions(roomCode);
    }
  });

  socket.on('sheriffAction', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.gameState.phase !== 'night') return;
    room.gameState.actions.sheriffCheck = targetId;
    const checkedPlayer = room.players.find(p => p.id === targetId);
    const result = (checkedPlayer && (checkedPlayer.role === 'mafia' || checkedPlayer.role === 'don')) ? 'Mafia' : 'Not Mafia';
    io.to(socket.id).emit('sheriffResult', { targetId, result });
    console.log(`Sheriff action in room ${roomCode}: target ${targetId}, result: ${result}`);
    checkNightActionsComplete(room);
  });

  socket.on('doctorAction', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.gameState.phase !== 'night') return;
    const doctorPlayer = room.players.find(p => !p.isDead && p.role === 'doctor');
    if (doctorPlayer && doctorPlayer.lastHealedTarget === targetId) {
      io.to(doctorPlayer.id).emit('error', 'You cannot heal the same player in consecutive nights.');
      return;
    }
    room.gameState.actions.doctorHeal = targetId;
    if (doctorPlayer) {
      doctorPlayer.lastHealedTarget = targetId;
    }
    console.log(`Doctor action in room ${roomCode}: target ${targetId}`);
    checkNightActionsComplete(room);
  });

  socket.on('prostituteAction', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.gameState.phase !== 'night') return;
    room.gameState.actions.prostituteBlock = targetId;
    console.log(`Prostitute action in room ${roomCode}: target ${targetId}`);
    checkNightActionsComplete(room);
  });

  socket.on('vote', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.gameState.phase !== 'voting') return;
    if (!room.gameState.votes) room.gameState.votes = {};
    if (!room.gameState.votedPlayers) room.gameState.votedPlayers = {};
    if (room.gameState.votedPlayers[socket.id]) {
      socket.emit('error', 'You have already voted.');
      return;
    }
    room.gameState.votedPlayers[socket.id] = targetId;
    room.gameState.votes[targetId] = (room.gameState.votes[targetId] || 0) + 1;
    console.log(`Vote in room ${roomCode}: ${socket.id} voted for ${targetId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const code in rooms) {
      const room = rooms[code];
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        if (room.players.length === 0) {
          delete rooms[code];
          console.log(`Room ${code} removed (empty).`);
        } else {
          io.in(code).emit('playerListUpdate', {
            players: room.players.map(p => ({ name: p.name, isHost: p.isHost }))
          });
        }
        break;
      }
    }
  });
});

// --- Вне обработки соединения --- //

// Функция генерации 4-символьного кода комнаты
function generateRoomCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

/* ==================================== */
/* Реализация механики игры "Мафия"    */
/* ==================================== */

// Фаза распределения ролей (15 секунд ознакомления)
function startMafiaGame(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.gameId !== 'mafia') return;
  const players = room.players;
  const numPlayers = players.length;
  const roles = assignRoles(numPlayers);
  for (let i = 0; i < players.length; i++) {
    players[i].role = roles[i];
    players[i].isDead = false;
    players[i].blocked = false;
    players[i].healedLastTime = false;
    if (players[i].role === 'doctor') {
      players[i].lastHealedTarget = null;
    }
  }
  players.forEach(p => {
    const desc = getRoleDescription(p.role);
    io.to(p.id).emit('roleAssignment', {
      role: p.role,
      description: desc.description,
      abilities: desc.abilities
    });
  });
  room.gameState = {
    phase: 'roleDistribution',
    timeLeft: 15,
    nightCount: 0,
    deadPlayers: [],
    actions: {}
  };
  io.in(roomCode).emit('phaseChanged', { phase: 'roleDistribution', timeLeft: 15 });
  // После 15 секунд переходим к ночной фазе
  setTimeout(() => {
    startNightPhase(roomCode);
  }, 15000);
}

// Распределение ролей без повторений
function assignRoles(numPlayers) {
  let possibleRoles;
  if (numPlayers === 6) {
    possibleRoles = ['mafia', 'don', 'sheriff', 'civilian', 'civilian', 'civilian'];
  } else if (numPlayers === 7) {
    possibleRoles = ['mafia', 'don', 'sheriff', 'doctor', 'prostitute', 'civilian', 'civilian'];
  } else if (numPlayers === 8) {
    possibleRoles = ['mafia', 'mafia', 'don', 'sheriff', 'doctor', 'prostitute', 'civilian', 'civilian'];
  } else if (numPlayers === 9) {
    possibleRoles = ['mafia', 'mafia', 'don', 'sheriff', 'doctor', 'prostitute', 'civilian', 'civilian', 'civilian'];
  } else if (numPlayers === 10) {
    possibleRoles = ['mafia', 'mafia', 'don', 'sheriff', 'doctor', 'prostitute', 'civilian', 'civilian', 'civilian', 'civilian'];
  } else {
    possibleRoles = ['mafia', 'mafia', 'mafia', 'don', 'sheriff', 'doctor', 'prostitute'];
    while (possibleRoles.length < numPlayers) {
      possibleRoles.push('civilian');
    }
  }
  const roles = [];
  for (let i = 0; i < numPlayers; i++) {
    const randomIndex = Math.floor(Math.random() * possibleRoles.length);
    roles.push(possibleRoles[randomIndex]);
    possibleRoles.splice(randomIndex, 1);
  }
  return roles;
}

function getRoleDescription(role) {
  switch (role) {
    case 'mafia':
      return {
        description: 'You are Mafia. Work with your team to eliminate civilians.',
        abilities: 'Collaborate each night to choose a target to kill.'
      };
    case 'don':
      return {
        description: 'You are the Don. Your vote is decisive in case of a tie.',
        abilities: 'Your choice overrides in ties. When checked by the Sheriff, you appear as a Civilian.'
      };
    case 'sheriff':
      return {
        description: 'You are the Sheriff. Uncover the identity of the Mafia.',
        abilities: 'Check one player each night to determine if they are Mafia.'
      };
    case 'doctor':
      return {
        description: 'You are the Doctor. Save lives by healing targeted players.',
        abilities: 'Heal one player each night. You cannot heal the same person two nights consecutively.'
      };
    case 'prostitute':
      return {
        description: 'You are the Prostitute. Block one player’s ability each night.',
        abilities: 'Choose one player to block their ability for the night.'
      };
    default:
      return {
        description: 'You are a Civilian. Use your wits to identify and eliminate the Mafia.',
        abilities: 'No night action.'
      };
  }
}

// Ночная фаза: длится 165 секунд (2 minutes 45 seconds)
function startNightPhase(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  room.gameState.phase = 'night';
  room.gameState.nightCount++;
  room.gameState.actions = {
    mafiaVotes: {},
    sheriffCheck: null,
    doctorHeal: null,
    prostituteBlock: null
  };
  io.in(roomCode).emit('phaseChanged', {
    phase: 'night',
    message: 'It’s time to sleep! Close your eyes and perform your actions.',
    timeLeft: 165,
    background: chooseBackground(['night.png', 'rain-night.png'])
  });
  room.gameState.nightTimer = setTimeout(() => {
    resolveNightActions(roomCode);
  }, 165000);
}

// Функция выбора случайного фона
function chooseBackground(options) {
  return options[Math.floor(Math.random() * options.length)];
}

// Проверка, что все живые мафиози (mafia и don) проголосовали
function checkMafiaVotesComplete(room) {
  const mafiaPlayers = room.players.filter(p =>
    !p.isDead && (p.role === 'mafia' || p.role === 'don')
  );
  return mafiaPlayers.every(p =>
    room.gameState.actions.mafiaVotes && room.gameState.actions.mafiaVotes[p.id]
  );
}

// Поиск кода комнаты по объекту комнаты
function getRoomCodeByRoom(roomObject) {
  for (const code in rooms) {
    if (rooms[code] === roomObject) {
      return code;
    }
  }
  return null;
}

// Разрешение ночных действий
function resolveNightActions(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  const actions = room.gameState.actions;
  const alivePlayers = room.players.filter(p => !p.isDead);
  let finalTargetId = null;
  if (actions.mafiaVotes && Object.keys(actions.mafiaVotes).length > 0) {
    const mafiaVotes = actions.mafiaVotes;
    const donPlayer = room.players.find(p => !p.isDead && p.role === 'don');
    if (donPlayer && mafiaVotes[donPlayer.id]) {
      finalTargetId = mafiaVotes[donPlayer.id];
      console.log(`Don's vote is final: ${finalTargetId}`);
    } else {
      const voteTally = {};
      for (const voterId in mafiaVotes) {
        const vote = mafiaVotes[voterId];
        if (vote) {
          voteTally[vote] = (voteTally[vote] || 0) + 1;
        }
      }
      let maxVotes = 0;
      let candidates = [];
      for (const targetId in voteTally) {
        if (voteTally[targetId] > maxVotes) {
          maxVotes = voteTally[targetId];
          candidates = [targetId];
        } else if (voteTally[targetId] === maxVotes) {
          candidates.push(targetId);
        }
      }
      if (candidates.length === 1) {
        finalTargetId = candidates[0];
      } else if (candidates.length > 1) {
        finalTargetId = candidates[Math.floor(Math.random() * candidates.length)];
      }
      console.log(`Mafia collective vote result: ${finalTargetId}`);
    }
  }
  if (!finalTargetId && alivePlayers.length > 0) {
    finalTargetId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
    console.log(`No mafia votes received. Randomly selected target: ${finalTargetId}`);
  }
  
  // Если путана заблокировала цель, убийство отменяется
  if (actions.prostituteBlock && actions.prostituteBlock === finalTargetId) {
    io.in(roomCode).emit('phaseChanged', {
      phase: 'night',
      message: 'The target was blocked by the Prostitute. No one dies tonight.',
      timeLeft: 0
    });
  }
  // Если доктор вылечил цель, убийство отменяется
  else if (actions.doctorHeal && actions.doctorHeal === finalTargetId) {
    io.in(roomCode).emit('phaseChanged', {
      phase: 'night',
      message: 'The target was healed by the Doctor. No one dies tonight.',
      timeLeft: 0
    });
  } else {
    const targetPlayer = room.players.find(p => p.id === finalTargetId);
    if (targetPlayer) {
      targetPlayer.isDead = true;
      room.gameState.deadPlayers = room.gameState.deadPlayers || [];
      room.gameState.deadPlayers.push({
        id: targetPlayer.id,
        role: targetPlayer.role,
        name: targetPlayer.name
      });
      io.in(roomCode).emit('playerDied', {
        id: targetPlayer.id,
        role: targetPlayer.role,
        name: targetPlayer.name
      });
    }
  }
  startMorningPhase(roomCode);
}

// Утренняя фаза: длится 5 минут (300 секунд)
function startMorningPhase(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  room.gameState.phase = 'morning';
  const backgrounds = ['day.png', 'rain.png'];
  const bg = chooseBackground(backgrounds);
  io.in(roomCode).emit('phaseChanged', {
    phase: 'morning',
    background: bg,
    message: 'Morning has arrived. The results of last night are revealed. Discuss now.',
    timeLeft: 300
  });
  setTimeout(() => {
    startVotingPhase(roomCode);
  }, 300000);
}

// Голосование: длится 60 секунд, при ничьей добавляется 30 секунд
function startVotingPhase(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  room.gameState.phase = 'voting';
  room.gameState.votes = {};
  room.gameState.votedPlayers = {};
  io.in(roomCode).emit('phaseChanged', {
    phase: 'voting',
    message: 'Time to vote! Cast your vote for the suspect.',
    timeLeft: 60
  });
  room.gameState.votingTimer = setTimeout(() => {
    processVotes(roomCode);
  }, 60000);
}

// Обработка голосования
function processVotes(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  const votes = room.gameState.votes || {};
  let maxVotes = 0;
  for (const targetId in votes) {
    if (votes[targetId] > maxVotes) {
      maxVotes = votes[targetId];
    }
  }
  const candidates = [];
  for (const targetId in votes) {
    if (votes[targetId] === maxVotes) {
      candidates.push(targetId);
    }
  }
  if (candidates.length > 1) {
    io.in(roomCode).emit('phaseChanged', {
      phase: 'votingTie',
      message: 'It’s a tie! You have 30 seconds to break the tie.',
      timeLeft: 30
    });
    room.gameState.votingTimer = setTimeout(() => {
      processVotes(roomCode);
    }, 30000);
  } else if (candidates.length === 1) {
    const targetPlayer = room.players.find(p => p.id === candidates[0]);
    if (targetPlayer) {
      targetPlayer.isDead = true;
      room.gameState.deadPlayers = room.gameState.deadPlayers || [];
      room.gameState.deadPlayers.push({
        id: targetPlayer.id,
        role: targetPlayer.role,
        name: targetPlayer.name
      });
      io.in(roomCode).emit('playerDied', {
        id: targetPlayer.id,
        role: targetPlayer.role,
        name: targetPlayer.name
      });
    }
    if (checkWinCondition(room)) {
      io.in(roomCode).emit('gameEnded', { message: 'Game over!' });
    } else {
      startNightPhase(roomCode);
    }
  } else {
    startNightPhase(roomCode);
  }
}

// Голосование: событие "vote" от игроков
io.on('connection', (socket) => {
  socket.on('vote', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.gameState.phase !== 'voting') return;
    if (!room.gameState.votes) room.gameState.votes = {};
    if (!room.gameState.votedPlayers) room.gameState.votedPlayers = {};
    if (room.gameState.votedPlayers[socket.id]) {
      socket.emit('error', 'You have already voted.');
      return;
    }
    room.gameState.votedPlayers[socket.id] = targetId;
    room.gameState.votes[targetId] = (room.gameState.votes[targetId] || 0) + 1;
    console.log(`Vote in room ${roomCode}: ${socket.id} voted for ${targetId}`);
  });
});

server.listen(process.env.PORT || 3001, () => {
  console.log(`Server running on port ${process.env.PORT || 3001}`);
});

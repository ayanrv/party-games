// server/index.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const {
  startMafiaGame,
  startNightPhase,
  processMafiaAction,
  processSheriffAction,
  processDoctorAction,
  processProstituteAction,
  processVote,
  checkMafiaVotesComplete
} = require('../mafiaMechanics');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3001;
const gameRules = {
  mafia: { minPlayers: 6, maxPlayers: 12 }
};
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generatePersistentId() {
  return 'p_' + Math.random().toString(36).substring(2, 10);
}

function mapPlayersForClient(players) {
  return players.map(p => ({
    name: p.name,
    isHost: p.isHost,
    isDead: !!p.isDead,
    role: p.isDead ? p.role : undefined,
    id: p.id,
    persistentId: p.persistentId,
  }));
}

io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  socket.on('createRoom', ({ gameId, name, persistentId }) => {
    if (!gameRules[gameId]) return socket.emit('error', 'Unsupported game ID.');
    if (!name?.trim()) return socket.emit('error', 'Name is required');

    const roomCode = generateRoomCode();
    const pid = persistentId?.trim() || generatePersistentId();

    rooms[roomCode] = {
      gameId,
      players: [{
        id: socket.id,
        persistentId: pid,
        name: name.trim(),
        isHost: true
      }],
      gameState: { phase: 'waiting' }
    };

    socket.join(roomCode);
    socket.emit('roomJoinedSuccessfully', {
      roomCode,
      players: mapPlayersForClient(rooms[roomCode].players),
      isHost: true,
      gameId
    });

    io.in(roomCode).emit('playerListUpdate', {
      players: mapPlayersForClient(rooms[roomCode].players)
    });

    console.log(`[+] Room ${roomCode} created by ${name} (${pid})`);
  });

  socket.on('joinRoom', ({ roomCode, name, persistentId }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', 'Room not found');
    if (!name?.trim()) return socket.emit('error', 'Name is required');

    const { maxPlayers } = gameRules[room.gameId];
    if (room.players.length >= maxPlayers) return socket.emit('error', 'Room is full');

    const pid = persistentId?.trim() || generatePersistentId();
    let existing = room.players.find(p => p.persistentId === pid);

    if (existing) {
      existing.id = socket.id;
      existing.name = name.trim();
    } else {
      existing = {
        id: socket.id,
        persistentId: pid,
        name: name.trim(),
        isHost: false
      };
      room.players.push(existing);
    }

    socket.join(roomCode);
    socket.emit('roomJoinedSuccessfully', {
      roomCode,
      players: mapPlayersForClient(room.players),
      isHost: existing.isHost,
      gameId: room.gameId
    });

    io.in(roomCode).emit('playerListUpdate', {
      players: mapPlayersForClient(room.players)
    });

    console.log(`[+] ${name} joined room ${roomCode} (${pid})`);
  });

  socket.on('startGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', 'Room not found');

    const current = room.players.find(p => p.id === socket.id);
    if (!current?.isHost) return socket.emit('error', 'Only the host can start the game.');

    if (room.players.length < gameRules[room.gameId].minPlayers) {
      return socket.emit('error', `Minimum ${gameRules[room.gameId].minPlayers} players required.`);
    }

    if (room.gameId === 'mafia') {
      startMafiaGame(roomCode, io, room);
      io.in(roomCode).emit('gameStarted', {
        roomCode,
        message: 'Mafia game has been started!',
        gameId: 'mafia'
      });
    }
  });

  socket.on('restartGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', 'Room not found');

    const current = room.players.find(p => p.id === socket.id);
    if (!current?.isHost) return socket.emit('error', 'Only the host can restart the game.');

    clearTimeout(room.gameState?.nightTimer);
    clearTimeout(room.gameState?.votingTimer);

    room.players.forEach(p => {
      p.isDead = false;
      p.role = undefined;
    });

    room.gameState = {}; // full reset

    if (room.gameId === 'mafia') {
      startMafiaGame(roomCode, io, room);
      io.in(roomCode).emit('gameRestarted', {
        roomCode,
        message: 'Mafia game restarted!',
        gameId: 'mafia'
      });
    }
  });

  socket.on('mafiaAction', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    if (player) processMafiaAction(roomCode, player.persistentId, targetId, rooms, io);
  });

  socket.on('sheriffAction', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    if (player) processSheriffAction(roomCode, player.persistentId, targetId, rooms, io);
  });

  socket.on('doctorAction', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    if (player) processDoctorAction(roomCode, player.persistentId, targetId, rooms, io);
  });

  socket.on('prostituteAction', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    if (player) processProstituteAction(roomCode, player.persistentId, targetId, rooms, io);
  });

  socket.on('vote', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    if (player) processVote(roomCode, player.persistentId, targetId, rooms, io);
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.id = null;
        io.in(code).emit('playerListUpdate', {
          players: mapPlayersForClient(room.players)
        });
      }
    }
    console.log(`[-] Socket disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Правила для игр (минимальное и максимальное количество игроков)
const gameRules = {
  mafia: { minPlayers: 4, maxPlayers: 12 },
  bunker: { minPlayers: 3, maxPlayers: 8 },
  'truth-or-dare': { minPlayers: 2, maxPlayers: 10 },
  court: { minPlayers: 3, maxPlayers: 8 }
};

// Хранение комнат в памяти
// Формат: rooms[roomCode] = { gameId, players: [ { id, name, isHost }, ... ] }
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Создание комнаты: первый игрок становится хостом
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
      players: [{ id: socket.id, name: name.trim(), isHost: true }]
    };
    socket.join(roomCode);
    // Отправляем событие только этому сокету
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

  // Запуск игры (только хост может начать)
  socket.on('startGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    const currentPlayer = room.players.find(p => p.id === socket.id);
    if (!currentPlayer || !currentPlayer.isHost) {
      socket.emit('error', 'Only the host can start the game.');
      return;
    }
    const { minPlayers } = gameRules[room.gameId];
    if (room.players.length < minPlayers) {
      socket.emit('error', `Not enough players. Minimum required: ${minPlayers}`);
      return;
    }
    io.in(roomCode).emit('gameStarted', {
      roomCode,
      message: 'Game has been started!'
    });
  });

  // Обработка отключения пользователя
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

// Функция генерации 4-символьного кода комнаты (случайные заглавные буквы)
function generateRoomCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

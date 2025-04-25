// client/pages/LobbyPage.jsx

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import './LobbyPage.css';

const LobbyPage = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();

  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [persistentId, setPersistentId] = useState('');

  // ✅ Уникальный ID на вкладку
  useEffect(() => {
    let id = sessionStorage.getItem('persistentId');
    if (!id) {
      id = 'p_' + crypto.randomUUID().slice(0, 8);
      sessionStorage.setItem('persistentId', id);
    }
    setPersistentId(id);
  }, []);

  useEffect(() => {
    if (!socket || !persistentId) return;

    socket.on('playerListUpdate', ({ players }) => {
      setPlayers(players);
      const me = players.find(p => p.persistentId === persistentId);
      setIsHost(!!me?.isHost);
    });

    socket.on('gameStarted', ({ gameId }) => {
      navigate(`/game/${gameId}/play`, { state: { roomCode } });
    });

    socket.on('error', (msg) => alert(msg));

    return () => {
      socket.off('playerListUpdate');
      socket.off('gameStarted');
      socket.off('error');
    };
  }, [socket, persistentId]);

  const handleStartGame = () => {
    if (!socket) return;
    socket.emit('startGame', { roomCode });
  };

  return (
    <div className="lobby-container">
      <h1>
        Room Code: <span className="room-code">{roomCode}</span>
      </h1>

      <h2>Players:</h2>
      <ul className="players-list">
        {players.map((p) => (
          <li key={p.persistentId} className={p.persistentId === persistentId ? 'you' : ''}>
            {p.name}
            {p.isHost && <span className="host-badge"> (Host)</span>}
            {p.persistentId === persistentId && <span className="you-tag"> (You)</span>}
          </li>
        ))}
      </ul>

      {isHost ? (
        <button className="start-game-btn" onClick={handleStartGame}>
          Start Game
        </button>
      ) : (
        <p className="waiting-msg">Waiting for the host to start the game...</p>
      )}
    </div>
  );
};

export default LobbyPage;

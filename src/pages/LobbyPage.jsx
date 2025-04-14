import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import './LobbyPage.css';

const LobbyPage = () => {
  const { roomCode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const { isHost = false, gameId = 'mafia' } = location.state || {};
  const socket = useSocket();
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    if (!socket) return;
    socket.on('playerListUpdate', (data) => {
      setPlayers(data.players);
    });
    socket.on('gameStarted', (data) => {
      navigate(`/game/${gameId}/play`);
    });
    socket.on('error', (msg) => {
      alert(msg);
    });
    return () => {
      socket.off('playerListUpdate');
      socket.off('gameStarted');
      socket.off('error');
    };
  }, [socket, navigate, gameId]);

  const handleStartGame = () => {
    if (socket) {
      socket.emit('startGame', { roomCode });
    }
  };

  return (
    <div className="lobby-container">
      <h1>Room Code: {roomCode}</h1>
      <h2>Players:</h2>
      <ul>
        {players.map((p, idx) => (
          <li key={idx}>
            {p.name} {p.isHost && <span className="host-badge">(Host)</span>}
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

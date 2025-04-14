import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import './RoomSelector.css';

const gameDetails = {
  mafia: {
    description: 'A social deduction game where players assume secret roles.',
    rules: 'Uncover the mafia while preserving innocents.'
  },
  bunker: {
    description: 'Debate and strategize to survive in a post-apocalyptic bunker.',
    rules: 'Decide who deserves a spot in the bunker.'
  },
  'truth-or-dare': {
    description: 'Challenge your friends with truths and dares.',
    rules: 'Pick truth to answer or dare to perform a challenge.'
  },
  court: {
    description: 'A quirky trial to find the guilty party.',
    rules: 'Debate, vote, and cast suspicion to reveal the culprit.'
  }
};

const RoomSelector = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();

  const [displayName, setDisplayName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Проверяем, мобильное ли устройство (ширина <= 600px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 600);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Подписываемся на события сокета
  useEffect(() => {
    if (!socket) return;
    socket.off('roomJoinedSuccessfully');
    socket.on('roomJoinedSuccessfully', (data) => {
      navigate(`/lobby/${data.roomCode}`, {
        state: { isHost: data.isHost, gameId: data.gameId, displayName }
      });
    });
    socket.on('error', (msg) => {
      alert(msg);
    });
    return () => {
      socket.off('roomJoinedSuccessfully');
      socket.off('error');
    };
  }, [socket, navigate, displayName, gameId]);

  // Создать комнату
  const handleCreateRoom = () => {
    if (!displayName.trim()) {
      alert('Please enter your name.');
      return;
    }
    socket.emit('createRoom', { gameId, name: displayName });
  };

  // Показать/скрыть поле ввода кода комнаты
  const handleToggleJoin = () => {
    setShowJoinInput(!showJoinInput);
  };

  // Присоединение к комнате
  const handleJoinRoom = () => {
    if (!displayName.trim()) {
      alert('Please enter your name.');
      return;
    }
    if (roomCodeInput.length !== 4) {
      alert('Room code must be exactly 4 letters.');
      return;
    }
    socket.emit('joinRoom', { roomCode: roomCodeInput.toUpperCase(), name: displayName });
  };

  return (
    <div className="room-selector-wrapper">
      {/* Карточка со всем интерфейсом */}
      <div className="room-selector-card">
        {/* Левая часть: Ayasha, диалог и поле "имя" */}
        <div className="left-section">
          <div className="ayasha-block">
            <img
              src="/images/ayasha.png"
              alt="Ayasha"
              className="ayasha-image"
            />
            <div className="dialog-bubble">
              <p>
                Join or create the room and have fun playing {' '}
                <strong>{gameId.charAt(0).toUpperCase() + gameId.slice(1)}</strong>!
              </p>
            </div>
          </div>
          <div className="name-section">
            <input
              type="text"
              placeholder="My name is Ayasha, and yours?"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
        </div>

        {/* Правая часть: описание (только мобиль) + кнопки + поле кода */}
        <div className="right-section">
          <h1>{gameId.charAt(0).toUpperCase() + gameId.slice(1)} - Room Options</h1>
          {isMobile && (
            <div className="mobile-game-details">
              <p><strong>Description:</strong> {gameDetails[gameId].description}</p>
              <p><strong>Rules:</strong> {gameDetails[gameId].rules}</p>
            </div>
          )}
          <div className="selector-buttons">
            <button onClick={handleCreateRoom} className="btn primary">
              Create Room
            </button>
            <button onClick={handleToggleJoin} className="btn secondary">
              {showJoinInput ? 'Cancel Join' : 'Join Room'}
            </button>
          </div>
          {showJoinInput && (
            <div className="join-section">
              <input
                type="text"
                placeholder="Enter room code (4 letters) "
                value={roomCodeInput}
                onChange={(e) => {
                  let val = e.target.value.toUpperCase();
                  if (val.length <= 4) setRoomCodeInput(val);
                }}
              />
              <button onClick={handleJoinRoom} className="btn tertiary">
                Join
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomSelector;

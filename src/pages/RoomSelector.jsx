import React, { useState, useEffect, useMemo } from 'react';
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
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 600);

  // ❗ Уникальный ID для каждой вкладки
  const persistentId = useMemo(() => {
    let id = sessionStorage.getItem('persistentId');
    if (!id) {
      id = 'p_' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem('persistentId', id);
    }
    return id;
  }, []);

  useEffect(() => {
    const updateMobile = () => setIsMobile(window.innerWidth <= 600);
    window.addEventListener('resize', updateMobile);
    return () => window.removeEventListener('resize', updateMobile);
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('roomJoinedSuccessfully', (data) => {
      navigate(`/lobby/${data.roomCode}`, {
        state: {
          gameId: data.gameId,
        }
      });
    });

    socket.on('error', (msg) => alert(msg));

    return () => {
      socket.off('roomJoinedSuccessfully');
      socket.off('error');
    };
  }, [socket, navigate]);

  const validateName = () => {
    const name = displayName.trim();
    if (!name) {
      alert('Please enter your name.');
      return false;
    }
    if (name.length < 2 || name.length > 20) {
      alert('Name must be 2-20 characters.');
      return false;
    }
    return true;
  };

  const handleCreateRoom = () => {
    if (!validateName() || !socket) return;
    socket.emit('createRoom', {
      gameId,
      name: displayName.trim(),
      persistentId
    });
  };

  const handleJoinRoom = () => {
    if (!validateName() || !socket) return;
    if (roomCodeInput.length !== 4) {
      alert('Room code must be 4 characters.');
      return;
    }
    socket.emit('joinRoom', {
      roomCode: roomCodeInput.toUpperCase(),
      name: displayName.trim(),
      persistentId
    });
  };

  return (
    <div className="room-selector-wrapper">
      <div className="room-selector-card">
        <div className="left-section">
          <div className="ayasha-block">
            <img src="/images/ayasha.png" alt="Ayasha" className="ayasha-image" />
            <div className="dialog-bubble">
              <p>
                Join or create a room and play <strong>{gameId.charAt(0).toUpperCase() + gameId.slice(1)}</strong>!
              </p>
            </div>
          </div>

          <div className="name-section">
            <input
              type="text"
              placeholder="My name is Ayasha, and yours?"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={20}
            />
          </div>
        </div>

        <div className="right-section">
          <h1>{gameId.charAt(0).toUpperCase() + gameId.slice(1)} Room Options</h1>

          {isMobile && (
            <div className="mobile-game-details">
              <p><strong>Description:</strong> {gameDetails[gameId]?.description}</p>
              <p><strong>Rules:</strong> {gameDetails[gameId]?.rules}</p>
            </div>
          )}

          <div className="selector-buttons">
            <button onClick={handleCreateRoom} className="btn primary">Create Room</button>
            <button
              onClick={() => setShowJoinInput(prev => !prev)}
              className="btn secondary"
            >
              {showJoinInput ? 'Cancel Join' : 'Join Room'}
            </button>
          </div>

          {showJoinInput && (
            <div className="join-section">
              <input
                type="text"
                placeholder="Enter room code (4 letters)"
                value={roomCodeInput}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  if (val.length <= 4) setRoomCodeInput(val);
                }}
                maxLength={4}
              />
              <button onClick={handleJoinRoom} className="btn tertiary">Join</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomSelector;
import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import './MafiaGame.css';

const MafiaGame = ({ roomCode }) => {
  const socket = useSocket();
  const [phase, setPhase] = useState('');
  const [background, setBackground] = useState('day.png');
  const [timeLeft, setTimeLeft] = useState(null);
  const [messages, setMessages] = useState([]);
  const [role, setRole] = useState(null);
  const [playerList, setPlayerList] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState('');
  const alertSound = useRef(new Audio('/sounds/alert-short.wav'));

  const roleImageMap = {
    mafia: '/images/mafia-card.jpg',
    don: '/images/don.jpg',
    sheriff: '/images/sheriff.jpg',
    doctor: '/images/doctor.jpg',
    prostitute: '/images/puta.jpg',
    civilian: '/images/civilian-man.jpg'
  };

  useEffect(() => {
    if (!socket) return;
    socket.on('roleAssignment', (data) => {
      setRole(data.role);
      addMessage(`Your role: ${data.role}. ${data.description} (${data.abilities})`);
    });
    socket.on('phaseChanged', ({ phase, background, message, timeLeft }) => {
      setPhase(phase);
      if (background) setBackground(background);
      if (timeLeft !== null) setTimeLeft(timeLeft);
      if (message) addMessage(message);
      alertSound.current.play();
      if (timeLeft === 0) alertSound.current.play();
    });
    socket.on('playerListUpdate', (data) => {
      setPlayerList(data.players);
    });
    socket.on('playerDied', (data) => {
      addMessage(`${data.name} (${data.role}) has died.`);
      alertSound.current.play();
    });
    socket.on('gameEnded', ({ message }) => {
      addMessage(message);
      alertSound.current.play();
    });
    socket.on('sheriffResult', ({ targetId, result }) => {
      if (role === 'sheriff') {
        addMessage(`Sheriff check: Player ${targetId} is ${result}.`);
        alertSound.current.play();
      }
    });
    return () => {
      socket.off('roleAssignment');
      socket.off('phaseChanged');
      socket.off('playerListUpdate');
      socket.off('playerDied');
      socket.off('gameEnded');
      socket.off('sheriffResult');
    };
  }, [socket, role]);

  function addMessage(text) {
    setMessages(prev => [...prev, text]);
  }

  const getTargetOptions = () => {
    return playerList;
  };

  const sendNightAction = () => {
    if (!selectedTarget) return;
    switch (role) {
      case 'mafia':
      case 'don':
        socket.emit('mafiaAction', { roomCode, targetId: selectedTarget });
        break;
      case 'sheriff':
        socket.emit('sheriffAction', { roomCode, targetId: selectedTarget });
        break;
      case 'doctor':
        socket.emit('doctorAction', { roomCode, targetId: selectedTarget });
        break;
      case 'prostitute':
        socket.emit('prostituteAction', { roomCode, targetId: selectedTarget });
        break;
      default:
        break;
    }
    addMessage(`Action sent: ${role} → ${selectedTarget}`);
    setSelectedTarget('');
    alertSound.current.play();
  };

  const sendVote = () => {
    if (!selectedTarget) return;
    socket.emit('vote', { roomCode, targetId: selectedTarget });
    addMessage(`You voted for ${selectedTarget}`);
    setSelectedTarget('');
    alertSound.current.play();
  };

  const showNightControls = () => {
    const rolesWithAction = ['mafia', 'don', 'sheriff', 'doctor', 'prostitute'];
    return phase === 'night' && role && rolesWithAction.includes(role);
  };

  const showVotingControls = () => {
    return phase === 'voting';
  };

  return (
    <div
      className="mafia-game-container"
      style={{ backgroundImage: `url(/images/${background})` }}
    >
      <div className="overlay-panel">
        <h2 className="phase-title">Phase: {phase}</h2>
        {timeLeft !== null && <p className="timer">Time left: {timeLeft} sec</p>}
        {role && (
          <div className="role-info-section">
            <p className="role-info">Your role: {role}</p>
            <img src={roleImageMap[role] || roleImageMap['civilian']} alt={role} className="role-card" />
          </div>
        )}
        <div className="messages">
          {messages.map((msg, idx) => (
            <p key={idx} className="message">{msg}</p>
          ))}
        </div>
        <div className="player-list">
          <h3>Players:</h3>
          <ul>
            {playerList.map((p, idx) => (
              <li key={idx}>
                {p.name} {p.isHost ? '(Host)' : ''}
              </li>
            ))}
          </ul>
        </div>
        {showNightControls() && (
          <div className="action-controls">
            <label htmlFor="targetSelect">Select target:</label>
            <select
              id="targetSelect"
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
            >
              <option value="">-- Choose --</option>
              {getTargetOptions().map((p, idx) => (
                <option key={idx} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button className="btn action-btn" onClick={sendNightAction}>
              Submit {role} Action
            </button>
          </div>
        )}
        {showVotingControls() && (
          <div className="voting-controls">
            <label htmlFor="voteSelect">Vote for:</label>
            <select
              id="voteSelect"
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
            >
              <option value="">-- Choose --</option>
              {getTargetOptions().map((p, idx) => (
                <option key={idx} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button className="btn vote-btn" onClick={sendVote}>
              Submit Vote
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MafiaGame;

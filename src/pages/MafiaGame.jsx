// client/components/MafiaGame.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import './MafiaGame.css';

if (!sessionStorage.getItem('persistentId')) {
  sessionStorage.setItem('persistentId', 'p_' + crypto.randomUUID().slice(0, 8));
}

const MafiaGame = ({ roomCode }) => {
  const socket = useSocket();
  const persistentId = sessionStorage.getItem('persistentId');

  const [phase, setPhase] = useState('');
  const [nightCount, setNightCount] = useState(0);
  const [background, setBackground] = useState('day.png');
  const [timeLeft, setTimeLeft] = useState(null);
  const [messages, setMessages] = useState([]);
  const [role, setRole] = useState(null);
  const [description, setDescription] = useState('');
  const [abilities, setAbilities] = useState('');
  const [team, setTeam] = useState('');
  const [image, setImage] = useState('');
  const [playerList, setPlayerList] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState('');
  const [showRoleDetails, setShowRoleDetails] = useState(false);
  const [gameResult, setGameResult] = useState(null);

  const alertSound = useRef(new Audio('/sounds/alert-short.wav'));
  const timerIntervalRef = useRef(null);

  const currentPlayer = playerList.find(p => p.persistentId === persistentId);
  const isHost = currentPlayer?.isHost;

  const resetTimer = (initialTime) => {
    setTimeLeft(initialTime);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const addMessage = (text) => setMessages(prev => [...prev, text]);

  const playerIsDead = () => currentPlayer?.isDead;

  const showNightControls = () => {
    const active = ['mafia', 'don', 'sheriff', 'doctor', 'prostitute'];
    return phase === 'night' && role && active.includes(role) && !playerIsDead();
  };

  const showVotingControls = () => phase === 'voting' && !playerIsDead();

  const getPlayerName = (id) => playerList.find(p => p.persistentId === id)?.name || 'Unknown';

  const getTargetOptions = () =>
    playerList.filter(p => !p.isDead && p.persistentId !== persistentId);

  const sendNightAction = () => {
    if (!selectedTarget) return;
    socket.emit(`${role}Action`, { roomCode, targetId: selectedTarget });
    addMessage(`You used your power on: ${getPlayerName(selectedTarget)}`);
    setSelectedTarget('');
    alertSound.current.play();
  };

  const sendVote = () => {
    if (!selectedTarget) return;
    socket.emit('vote', { roomCode, targetId: selectedTarget });
    addMessage(`You voted for: ${getPlayerName(selectedTarget)}`);
    setSelectedTarget('');
    alertSound.current.play();
  };

  const handleRestartGame = () => {
    socket.emit('restartGame', { roomCode });
  };

  useEffect(() => {
    const box = document.querySelector('.messages-box');
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!socket) return;

    const resetGameState = () => {
      setMessages([]);
      setGameResult(null);
      setNightCount(0);
      setPhase('');
      setPlayerList([]);
      setRole(null);
      setDescription('');
      setAbilities('');
      setTeam('');
      setImage('');
      setSelectedTarget('');
    };

    socket.on('roleAssignment', ({ role, description, abilities, team, image }) => {
      setRole(role);
      setDescription(description);
      setAbilities(abilities);
      setTeam(team);
      setImage(image);
      addMessage(`You are ${role.toUpperCase()} (${team})`);
    });

    socket.on('phaseChanged', ({ phase, background, message, timeLeft }) => {
      setPhase(phase);
      if (phase === 'night') setNightCount(n => n + 1);
      if (background) setBackground(background);
      if (timeLeft !== null) resetTimer(timeLeft);
      if (message) addMessage(message);
      alertSound.current.play();
    });

    socket.on('playerListUpdate', ({ players }) => setPlayerList(players));
    socket.on('playerDied', ({ name, role }) => addMessage(`${name} (${role}) has died.`));
    socket.on('gameEnded', ({ message }) => {
      addMessage(message);
      setGameResult(message);
      alertSound.current.play();
    });

    socket.on('sheriffResult', ({ targetId, result }) => {
      if (role === 'sheriff') addMessage(`Sheriff checked ${getPlayerName(targetId)}: ${result}`);
    });

    socket.on('nightSummary', ({ message }) => addMessage(message));
    socket.on('votingUpdate', ({ votes }) => {
      Object.entries(votes).forEach(([voter, target]) => {
        addMessage(`${getPlayerName(voter)} voted for ${getPlayerName(target)}`);
      });
    });

    socket.on('voteResults', ({ summary }) => summary.forEach(line => addMessage(line)));
    socket.on('voteExecuted', ({ message }) => addMessage(message));

    socket.on('gameRestarted', ({ message }) => {
      resetGameState();
      addMessage(message);
    });

    return () => {
      socket.off('roleAssignment');
      socket.off('phaseChanged');
      socket.off('playerListUpdate');
      socket.off('playerDied');
      socket.off('gameEnded');
      socket.off('sheriffResult');
      socket.off('nightSummary');
      socket.off('votingUpdate');
      socket.off('voteResults');
      socket.off('voteExecuted');
      socket.off('gameRestarted');
      clearInterval(timerIntervalRef.current);
    };
  }, [socket, role]);

  return (
    <div className="mafia-game-container" style={{ backgroundImage: `url(/images/${background})` }}>
      <div className="game-overlay">
        {gameResult && (
          <div className="modal-overlay">
            <div className="modal-box">
              <h2>🎉 {gameResult}</h2>
              {isHost && <button className="restart-btn" onClick={handleRestartGame}>Restart Game</button>}
            </div>
          </div>
        )}

        <div className="left-panel">
          <h2 className="phase-title">Phase: {phase.toUpperCase()} {phase === 'night' ? `(Night ${nightCount})` : ''}</h2>
          {timeLeft !== null && <p className="timer">⏱ {timeLeft} sec</p>}

          <div className="messages-box">
            {messages.map((msg, idx) => <p key={idx} className="message">{msg}</p>)}
          </div>

          {showNightControls() && (
            <div className="action-controls">
              <label>🎯 Choose target:</label>
              <select value={selectedTarget} onChange={(e) => setSelectedTarget(e.target.value)}>
                <option value="">-- Select --</option>
                {getTargetOptions().map(p => (
                  <option key={p.persistentId} value={p.persistentId}>{p.name}</option>
                ))}
              </select>
              <button className="btn" onClick={sendNightAction}>Submit</button>
            </div>
          )}

          {showVotingControls() && (
            <div className="voting-controls">
              <label>🗳 Vote:</label>
              <select value={selectedTarget} onChange={(e) => setSelectedTarget(e.target.value)}>
                <option value="">-- Select --</option>
                {getTargetOptions().map(p => (
                  <option key={p.persistentId} value={p.persistentId}>{p.name}</option>
                ))}
              </select>
              <button className="btn vote-btn" onClick={sendVote}>Vote</button>
            </div>
          )}
        </div>

        <div className="right-panel">
          <div className="own-role-card" onClick={() => setShowRoleDetails(!showRoleDetails)}>
            {role ? <img src={image} alt={role} /> : <div className="loading-role">Loading role...</div>}
            {showRoleDetails && role && (
              <div className="role-details">
                <h3>{role.toUpperCase()}</h3>
                <p><strong>Team:</strong> {team}</p>
                <p>{description}</p>
                <p><em>{abilities}</em></p>
              </div>
            )}
          </div>

          <div className="players-row">
            {playerList.map(p => (
              <div key={p.persistentId} className={`player-item${p.isDead ? ' dead' : ''}`}>
                <span className="player-name">{p.name}</span>
                {p.isDead && p.role && (
                  <span className="player-role">
                    <img
                      src={`/images/roles/${p.role}.png`}
                      alt={p.role}
                      title={p.role}
                      className="role-icon"
                    />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MafiaGame;

// server/mafiaMechanics.js

const nightBackgrounds = ['night.png', 'rain-night.png'];
const dayBackgrounds = ['day.png', 'rain.png'];

function chooseBackground(options) {
  return options[Math.floor(Math.random() * options.length)];
}

function assignRoles(numPlayers) {
  let roles = [];
  switch (numPlayers) {
    case 6:
      roles = ['mafia', 'don', 'sheriff', 'civilian', 'civilian', 'civilian']; break;
    case 7:
      roles = ['mafia', 'don', 'sheriff', 'doctor', 'prostitute', 'civilian', 'civilian']; break;
    case 8:
      roles = ['mafia', 'mafia', 'don', 'sheriff', 'doctor', 'prostitute', 'civilian', 'civilian']; break;
    case 9:
      roles = ['mafia', 'mafia', 'don', 'sheriff', 'doctor', 'prostitute', 'civilian', 'civilian', 'civilian']; break;
    case 10:
      roles = ['mafia', 'mafia', 'don', 'sheriff', 'doctor', 'prostitute', 'civilian', 'civilian', 'civilian', 'civilian']; break;
    default:
      roles = ['mafia', 'mafia', 'mafia', 'don', 'sheriff', 'doctor', 'prostitute'];
      while (roles.length < numPlayers) roles.push('civilian');
  }
  return roles.sort(() => 0.5 - Math.random());
}

function getRoleDescription(role) {
  const desc = {
    mafia: ['You are Mafia. Eliminate civilians.', 'Vote to kill during the night.', 'Mafia'],
    don: ['You are the Don. Appear innocent to Sheriff.', 'Break ties in mafia votes.', 'Mafia'],
    sheriff: ['You are the Sheriff. Investigate players.', 'Check roles at night.', 'Civilians'],
    doctor: ['You are the Doctor. Heal players.', 'Heal one player per night.', 'Civilians'],
    prostitute: ['You are the Prostitute. Block players.', 'Block night action and vote.', 'Civilians'],
    'civilian-man': ['You are a Civilian (man).', 'No night action.', 'Civilians'],
    'civilian-woman': ['You are a Civilian (woman).', 'No night action.', 'Civilians'],
    civilian: ['You are a Civilian.', 'No night action.', 'Civilians']
  };

  const imgMap = {
    mafia: '/images/roles/mafia-card.png',
    don: '/images/roles/don.png',
    sheriff: '/images/roles/sheriff.png',
    doctor: '/images/roles/doctor.png',
    prostitute: '/images/roles/puta.png',
    'civilian-man': '/images/roles/civilian-man.png',
    'civilian-woman': '/images/roles/civilian-woman.png',
    civilian: '/images/roles/civilian-man.png'
  };

  return {
    description: desc[role]?.[0] || 'You are a Civilian.',
    abilities: desc[role]?.[1] || 'No special night action.',
    team: desc[role]?.[2] || 'Civilians',
    image: imgMap[role] || '/images/roles/civilian-man.png'
  };
}

function mapPlayersForClient(players) {
  return players.map(p => ({
    name: p.name,
    isHost: p.isHost,
    isDead: !!p.isDead,
    role: p.isDead ? p.role : undefined,
    id: p.id,
    persistentId: p.persistentId
  }));
}

function checkMafiaVotesComplete(room) {
  const mafia = room.players.filter(p => !p.isDead && ['mafia', 'don'].includes(p.role));
  const votes = room.gameState?.actions?.mafiaVotes || {};
  return Object.keys(votes).length >= mafia.length;
}

function startMafiaGame(roomCode, io, room) {
  const roles = assignRoles(room.players.length);
  let alt = true;

  room.players.forEach((p, i) => {
    p.role = roles[i] === 'civilian' ? (alt ? 'civilian-man' : 'civilian-woman') : roles[i];
    alt = !alt;
    p.isDead = false;
    p.blocked = false;
    if (p.role === 'doctor') p.lastHealedTarget = null;
    if (p.role === 'prostitute') p.lastBlockedTarget = null;
    if (p.role === 'sheriff') p.checked = [];
  });

  room.players.forEach(p => {
    const { description, abilities, team, image } = getRoleDescription(p.role);
    io.to(p.id).emit('roleAssignment', {
      role: p.role, description, abilities, team, image
    });
  });

  room.gameState = {
    phase: 'roleDistribution',
    timeLeft: 15,
    nightCount: 0,
    deadPlayers: [],
    actions: {}
  };

  io.in(roomCode).emit('playerListUpdate', {
    players: mapPlayersForClient(room.players)
  });

  io.in(roomCode).emit('phaseChanged', {
    phase: 'roleDistribution',
    timeLeft: 15
  });

  setTimeout(() => startNightPhase(roomCode, io, room), 15000);
}

function startNightPhase(roomCode, io, room) {
  room.gameState.phase = 'night';
  room.gameState.nightCount++;
  room.players.forEach(p => p.blocked = false);

  room.gameState.actions = {
    mafiaVotes: {},
    sheriffCheck: null,
    doctorHeal: null,
    prostituteBlock: null
  };

  const nightBg = chooseBackground(nightBackgrounds);

  io.in(roomCode).emit('phaseChanged', {
    phase: 'night',
    message: 'Night falls. Perform your actions.',
    timeLeft: 165,
    background: nightBg
  });

  room.gameState.nightTimer = setTimeout(() => {
    resolveNightActions(roomCode, io, room);
  }, 165000);
}

function resolveNightActions(roomCode, io, room) {
  const actions = room.gameState.actions;
  const alive = room.players.filter(p => !p.isDead);
  let finalTargetId = null;

  const mafiaVotes = actions.mafiaVotes || {};
  const don = alive.find(p => p.role === 'don');
  if (don && mafiaVotes[don.persistentId]) {
    finalTargetId = mafiaVotes[don.persistentId];
  } else {
    const tally = {};
    Object.values(mafiaVotes).forEach(id => {
      tally[id] = (tally[id] || 0) + 1;
    });
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (top.length) {
      const maxVotes = top[0][1];
      const candidates = top.filter(([_, v]) => v === maxVotes).map(([id]) => id);
      finalTargetId = candidates[Math.floor(Math.random() * candidates.length)];
    }
  }

  if (!finalTargetId && alive.length > 0) {
    finalTargetId = alive[Math.floor(Math.random() * alive.length)].persistentId;
  }

  let killMsg = '';
  if (actions.doctorHeal === finalTargetId || actions.prostituteBlock === finalTargetId) {
    killMsg = 'No one died tonight.';
    finalTargetId = null;
  }

  if (finalTargetId) {
    const victim = room.players.find(p => p.persistentId === finalTargetId);
    if (victim) {
      victim.isDead = true;
      room.gameState.deadPlayers.push({ id: victim.id, role: victim.role, name: victim.name });
      io.in(roomCode).emit('playerDied', { id: victim.id, name: victim.name, role: victim.role });
      killMsg = `Mafia killed ${victim.name}.`;
    }
  }

  io.in(roomCode).emit('nightSummary', { message: killMsg || 'No one was killed tonight.' });

  const win = checkWinCondition(room);
  if (win) {
    io.in(roomCode).emit('gameEnded', { message: win.message });
  } else {
    startMorningPhase(roomCode, io, room);
  }
}

function startMorningPhase(roomCode, io, room) {
  room.gameState.phase = 'morning';
  const bg = chooseBackground(dayBackgrounds);
  io.in(roomCode).emit('phaseChanged', {
    phase: 'morning',
    message: 'Morning is here. Discuss and prepare to vote.',
    timeLeft: 300,
    background: bg
  });
  setTimeout(() => startVotingPhase(roomCode, io, room), 300000);
}

function startVotingPhase(roomCode, io, room) {
  room.gameState.phase = 'voting';
  room.gameState.votes = {};
  room.gameState.votedPlayers = {};
  io.in(roomCode).emit('phaseChanged', {
    phase: 'voting',
    message: 'Time to vote. Choose wisely.',
    timeLeft: 60
  });
  room.gameState.votingTimer = setTimeout(() => processVotes(roomCode, io, room), 60000);
}

function processVotes(roomCode, io, room) {
  const votes = room.gameState.votes || {};
  const tally = {};
  for (const voter in votes) {
    const target = votes[voter];
    tally[target] = (tally[target] || 0) + 1;
  }

  const max = Math.max(...Object.values(tally));
  const candidates = Object.entries(tally).filter(([_, v]) => v === max).map(([id]) => id);

  io.in(roomCode).emit('voteResults', {
    summary: Object.entries(tally).map(([id, v]) => {
      const p = room.players.find(p => p.persistentId === id);
      return `${p?.name || 'Unknown'}: ${v} vote(s)`;
    })
  });

  if (candidates.length > 1) {
    io.in(roomCode).emit('phaseChanged', {
      phase: 'votingTie',
      message: 'It is a tie! Revote in 30 seconds.',
      timeLeft: 30
    });
    room.gameState.votingTimer = setTimeout(() => processVotes(roomCode, io, room), 30000);
  } else if (candidates.length === 1) {
    const executed = room.players.find(p => p.persistentId === candidates[0]);
    if (executed) {
      executed.isDead = true;
      room.gameState.deadPlayers.push({ id: executed.id, role: executed.role, name: executed.name });
      io.in(roomCode).emit('playerDied', { id: executed.id, name: executed.name, role: executed.role });
      io.in(roomCode).emit('voteExecuted', { message: `${executed.name} was executed by vote.` });
    }
    const win = checkWinCondition(room);
    if (win) io.in(roomCode).emit('gameEnded', { message: win.message });
    else startNightPhase(roomCode, io, room);
  } else {
    startNightPhase(roomCode, io, room);
  }
}

function processVote(roomCode, voterPid, targetPid, rooms, io) {
  const room = rooms[roomCode];
  const voter = room.players.find(p => p.persistentId === voterPid);
  if (!voter || room.gameState.phase !== 'voting' || voter.blocked) return;
  if (room.gameState.votedPlayers[voterPid]) return;
  room.gameState.votedPlayers[voterPid] = true;
  room.gameState.votes[voterPid] = targetPid;
  io.in(roomCode).emit('votingUpdate', { votes: room.gameState.votes });
}

function processMafiaAction(roomCode, playerPid, targetPid, rooms, io) {
  const room = rooms[roomCode];
  if (!room || room.gameState.phase !== 'night') return;
  room.gameState.actions.mafiaVotes[playerPid] = targetPid;
  if (checkMafiaVotesComplete(room)) {
    clearTimeout(room.gameState.nightTimer);
    resolveNightActions(roomCode, io, room);
  }
}

function processSheriffAction(roomCode, playerPid, targetPid, rooms, io) {
  const room = rooms[roomCode];
  const sheriff = room.players.find(p => p.persistentId === playerPid && p.role === 'sheriff');
  if (!sheriff || room.gameState.phase !== 'night') return;
  if (sheriff.checked.includes(targetPid)) return;
  sheriff.checked.push(targetPid);
  const target = room.players.find(p => p.persistentId === targetPid);
  const result = ['mafia', 'don'].includes(target?.role) ? 'Mafia' : 'Not Mafia';
  io.to(sheriff.id).emit('sheriffResult', { targetId: targetPid, result });
}

function processDoctorAction(roomCode, playerPid, targetPid, rooms, io) {
  const room = rooms[roomCode];
  const doctor = room.players.find(p => p.persistentId === playerPid && p.role === 'doctor');
  if (!doctor || room.gameState.phase !== 'night') return;
  if (doctor.lastHealedTarget === targetPid) return;
  doctor.lastHealedTarget = targetPid;
  room.gameState.actions.doctorHeal = targetPid;
}

function processProstituteAction(roomCode, playerPid, targetPid, rooms, io) {
  const room = rooms[roomCode];
  const prostitute = room.players.find(p => p.persistentId === playerPid && p.role === 'prostitute');
  if (!prostitute || room.gameState.phase !== 'night') return;
  if (prostitute.lastBlockedTarget === targetPid) return;
  prostitute.lastBlockedTarget = targetPid;
  room.gameState.actions.prostituteBlock = targetPid;
  const blocked = room.players.find(p => p.persistentId === targetPid);
  if (blocked) blocked.blocked = true;
}

function checkWinCondition(room) {
  const alive = room.players.filter(p => !p.isDead);
  const mafia = alive.filter(p => ['mafia', 'don'].includes(p.role)).length;
  const civilians = alive.length - mafia;
  if (mafia === 0) return { win: 'civilians', message: 'Civilians win! All mafia eliminated.' };
  if (mafia >= civilians) return { win: 'mafia', message: 'Mafia win! They outnumber civilians.' };
  return null;
}

module.exports = {
  startMafiaGame,
  startNightPhase,
  processMafiaAction,
  processSheriffAction,
  processDoctorAction,
  processProstituteAction,
  processVote,
  checkMafiaVotesComplete
};

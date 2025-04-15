import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import { startConfetti } from './confetti';

// Импорт страниц
import HomePage from './pages/HomePage';
import RoomSelector from './pages/RoomSelector';
import LobbyPage from './pages/LobbyPage';
import MafiaGame from './pages/MafiaGame';
import BunkerPage from './pages/BunkerPage';
import TruthOrDarePage from './pages/TruthOrDarePage';
import CourtPage from './pages/CourtPage';

function App() {
  useEffect(() => {
    startConfetti();
  }, []);

  return (
    <SocketProvider>
      <Router>
        <Routes>
          {/* Главная страница с карточками игр */}
          <Route path="/" element={<HomePage />} />
          {/* Страница выбора комнаты для выбранной игры */}
          <Route path="/select/:gameId" element={<RoomSelector />} />
          {/* Страница лобби комнаты */}
          <Route path="/lobby/:roomCode" element={<LobbyPage />} />
          {/* Страницы конкретных игр */}
          <Route path="/game/mafia/play" element={<MafiaGame />} />
          <Route path="/game/bunker/play" element={<BunkerPage />} />
          <Route path="/game/truth-or-dare/play" element={<TruthOrDarePage />} />
          <Route path="/game/court/play" element={<CourtPage />} />
        </Routes>
      </Router>
    </SocketProvider>
  );
}

export default App;

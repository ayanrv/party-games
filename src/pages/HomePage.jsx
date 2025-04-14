import React from 'react';
import { useNavigate } from 'react-router-dom';
import DeckCard from '../components/DeckCard';
import './HomePage.css';

const games = [
  {
    id: 'mafia',
    description: 'A social deduction game where players assume secret roles.',
    rules: 'Uncover the mafia while preserving innocents.',
    image: '/images/mafia.jpg'
  },
  {
    id: 'bunker',
    description: 'Debate and strategize to survive in a post-apocalyptic bunker.',
    rules: 'Decide who deserves a spot in the bunker.',
    image: '/images/bunker.jpg'
  },
  {
    id: 'truth-or-dare',
    description: 'Challenge your friends with truths and dares.',
    rules: 'Pick truth to answer or dare to perform a challenge.',
    image: '/images/truth-or-dare.jpg'
  },
  {
    id: 'court',
    description: 'A quirky trial to find the guilty party.',
    rules: 'Debate, vote, and cast suspicion to reveal the culprit.',
    image: '/images/court.jpg'
  }
];

const HomePage = () => {
  const navigate = useNavigate();

  const handleCardClick = (gameId) => {
    navigate(`/select/${gameId}`);
  };

  return (
    <div className="home-container">
      <img
          src="/images/party-games-logo.png"
          alt="Party Games Logo"
          className="party-logo"
      />

      <div className="home-game-cards">
        {games.map((game) => (
          <DeckCard
            key={game.id}
            image={game.image}
            description={game.description}
            rules={game.rules}
            onClick={() => handleCardClick(game.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default HomePage;

import React from 'react';
import './DeckCard.css';

const DeckCard = ({ image, description, rules, onClick }) => {
  return (
    <div className="deck-card" onClick={onClick}>
      {/* Левая часть с изображением */}
      <div className="deck-card-image">
        <img src={image} alt="Game" />
      </div>

      {/* Правая часть: "складная" панель (Desktop), 
         или будем переопределять на мобильном */}
      <div className="deck-card-fold">
        <div className="deck-card-fold-content">
          <h3>Description</h3>
          <p>{description}</p>
          <h3>Rules</h3>
          <p>{rules}</p>
        </div>
      </div>
    </div>
  );
};

export default DeckCard;

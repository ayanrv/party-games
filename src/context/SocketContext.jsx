// client/context/SocketContext.jsx

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = io('http://localhost:3001', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 8000
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log(`🔌 Connected as ${newSocket.id}`);
    });

    newSocket.on('disconnect', (reason) => {
      console.warn(`🚫 Disconnected: ${reason}`);
    });

    newSocket.on('connect_error', (err) => {
      console.error('❌ Connection error:', err.message);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('❗useSocket must be used within a <SocketProvider>');
  }
  return context;
};
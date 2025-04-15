import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';
    const newSocket = io(serverUrl);
    setSocket(newSocket);
    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
    });
    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });
    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
    return () => newSocket.disconnect();
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);

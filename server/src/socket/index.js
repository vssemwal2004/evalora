function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.emit('system:ready', {
      socketId: socket.id,
      message: 'Evalora realtime channel connected.',
    });

    socket.on('disconnect', () => {});
  });
}

module.exports = registerSocketHandlers;

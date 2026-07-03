const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');
const { closeRateLimitRedis } = require('./config/rateLimitRedis');
const registerSocketHandlers = require('./socket');

async function bootstrap() {
  await connectDB();

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: env.frontendOrigins,
      credentials: true,
    },
  });

  registerSocketHandlers(io);
  app.set('io', io);

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${env.port} is already in use. Stop the existing server or change PORT in server/.env.`);
      process.exit(1);
    }

    console.error('HTTP server error.');
    console.error(error);
    process.exit(1);
  });

  server.listen(env.port, () => {
    console.log(`Evalora API running on port ${env.port}`);
  });

  function shutdown(signal) {
    console.log(`${signal} received. Closing Evalora API.`);
    closeRateLimitRedis();
    server.close(() => {
      process.exit(0);
    });
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  console.error('Failed to start Evalora API.');
  console.error(error);
  process.exit(1);
});

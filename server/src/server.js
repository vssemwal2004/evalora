const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');
const registerSocketHandlers = require('./socket');

async function bootstrap() {
  await connectDB();

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: env.frontendUrl,
      credentials: true,
    },
  });

  registerSocketHandlers(io);

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
}

bootstrap().catch((error) => {
  console.error('Failed to start Evalora API.');
  console.error(error);
  process.exit(1);
});

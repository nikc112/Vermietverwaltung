import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import fcors from '@fastify/cors';
import { config } from '../config';

const corsPlugin: FastifyPluginAsync = fp(async (server) => {
  const allowedOrigins =
    config.NODE_ENV === 'development'
      ? [config.APP_URL, 'http://localhost:5173', 'http://localhost:8080']
      : [config.APP_URL];

  server.register(fcors, {
    origin: allowedOrigins,
    credentials: true,
  });
});

export default corsPlugin;

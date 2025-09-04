import winston from 'winston';

const logLevel = process.env['LOG_LEVEL'] ?? 'info';
const isDevelopment = process.env.NODE_ENV === 'development';

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    isDevelopment
      ? winston.format.prettyPrint({ colorize: true, depth: 4 })
      : winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});

export { logger };

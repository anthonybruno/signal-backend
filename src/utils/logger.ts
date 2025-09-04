import winston from 'winston';

const logLevel = process.env['LOG_LEVEL'] ?? 'info';
const isDevelopment = process.env.NODE_ENV === 'development';

const developmentFormat = winston.format.combine(
  winston.format.prettyPrint({ colorize: true, depth: 2 }),
);

const productionFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.timestamp(),
  winston.format.json(),
);

const logger = winston.createLogger({
  level: logLevel,
  format: isDevelopment ? developmentFormat : productionFormat,
  transports: [new winston.transports.Console()],
});

export { logger };

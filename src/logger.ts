import { createLogger, format, transports } from "winston";

export const logger = createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.printf(
      ({ timestamp, level, message, ...meta }) =>
        `${timestamp} [${level}] ${message}` +
        (Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "")
    )
  ),
  transports: [new transports.Console()],
});

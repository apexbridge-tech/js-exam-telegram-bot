import { createLogger, format, transports, type Logger } from "winston";

const isProd = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL ?? (isProd ? "info" : "debug");

// Common pre-formatting
const base = format.combine(
  format.timestamp(),
  format.errors({ stack: true }), // ensure Error.stack is serialized
  format.splat() // supports printf-style %s, %j etc.
);

// Pretty for dev, JSON for prod
const devFmt = format.combine(
  format.colorize({ all: true }),
  format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    const metaStr = Object.keys(meta).length
      ? `\n${JSON.stringify(meta, null, 2)}`
      : "";
    return `${timestamp} ${level} ${message}${
      stack ? `\n${stack}` : ""
    }${metaStr}`;
  })
);

const prodFmt = format.json();

export const logger: Logger = createLogger({
  level,
  format: isProd ? format.combine(base, prodFmt) : format.combine(base, devFmt),
  transports: [
    new transports.Console(),
    new transports.File({ filename: "./logs/app.log", level: "info" }), // all info+
    new transports.File({ filename: "./logs/error.log", level: "error" }), // errors only
  ],
  // Winston can auto-log unhandled exceptions/rejections:
  exceptionHandlers: [
    new transports.File({ filename: "./logs/exceptions.log" }),
  ],
  rejectionHandlers: [
    new transports.File({ filename: "./logs/rejections.log" }),
  ],
});

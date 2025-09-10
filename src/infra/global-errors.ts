import { logger } from "../logger.js";

function logErr(kind: string, err: unknown): void {
  if (err instanceof Error) {
    logger.error(`${kind}: ${err.message}`, { kind, err, stack: err.stack });
  } else {
    logger.error(`${kind}: ${String(err)}`, { kind, err });
  }
}

export function installGlobalErrorHandlers(): void {
  process.on("uncaughtException", (err: Error) => {
    logErr("uncaughtException", err);
    // optionally exit: process.exit(1);
  });

  process.on(
    "unhandledRejection",
    (reason: unknown, promise: Promise<unknown>) => {
      logger.error("Unhandled promise rejection", { reason, promise });
      // optionally exit: process.exit(1);
    }
  );

  process.on("warning", (w: Error) => {
    logger.warn(`Process warning: ${w.name}: ${w.message}`, { stack: w.stack });
  });

  process.on(
    "multipleResolves",
    (type: "resolve" | "reject", p: Promise<unknown>, value: unknown) => {
      logger.warn(`multipleResolves: ${type}`, { promise: p, value });
    }
  );

  process.on("warning", (w: Error) => {
    logger.warn(`Process warning: ${w.name}: ${w.message}`, { stack: w.stack });
  });

  process.on("multipleResolves", (type, _p, value) => {
    logger.warn(`multipleResolves: ${type}`, { value });
  });

  ["SIGINT", "SIGTERM"].forEach((sig) => {
    process.on(sig as NodeJS.Signals, () => {
      logger.info(`Signal received: ${sig}. Shutting down…`);
      setTimeout(() => process.exit(0), 150);
    });
  });
}

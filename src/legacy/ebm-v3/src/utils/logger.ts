import winston from "winston";

/**
 * Winston Logger Configuration
 *
 * Log Levels (in order of priority):
 * - error: 0 - Critical errors that need immediate attention
 * - warn: 1 - Warning messages for potential issues
 * - info: 2 - General informational messages (default)
 * - http: 3 - HTTP request logs
 * - verbose: 4 - Verbose information
 * - debug: 5 - Debug information for development
 * - silly: 6 - Extremely detailed logs
 *
 * Set LOG_LEVEL environment variable to control logging:
 * - production: LOG_LEVEL=info (default)
 * - development: LOG_LEVEL=debug
 * - troubleshooting: LOG_LEVEL=verbose or LOG_LEVEL=silly
 */

const logLevel = process.env.LOG_LEVEL || "info";

// Log prefixes for hierarchy (clean code, readable logs)
export const LOG_PREFIX = {
  MAIN: "", // Main operations (no prefix)
  L1: "  ", // Level 1: Per-diagnosis operations
  L2: "    ", // Level 2: Sub-operations
  L3: "      ", // Level 3: Service-specific (RAG/LLM)
};

// Create a custom format for readable logs
const readableFormat = winston.format.printf(
  ({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    // Add metadata if present (but not for stack traces)
    if (Object.keys(meta).length > 0 && meta.stack) {
      msg += `\n${meta.stack}`;
    } else if (Object.keys(meta).length > 0) {
      // Don't add metadata for simple logs
      const metaKeys = Object.keys(meta).filter(
        (key) => !["timestamp", "level", "message"].includes(key)
      );
      if (metaKeys.length > 0) {
        msg += ` ${JSON.stringify(meta)}`;
      }
    }
    return msg;
  }
);

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    readableFormat
  ),
  transports: [
    // Error logs only
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // All logs
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  ],
});

// Console logging for non-production environments
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "HH:mm:ss" }),
        readableFormat
      ),
    })
  );
}

// Log the current configuration on startup
const env = process.env.NODE_ENV || "development";
const consoleEnabled = process.env.NODE_ENV !== "production";
logger.info(
  `Logger initialized - Level: ${logLevel}, Environment: ${env}, Console: ${consoleEnabled}`
);

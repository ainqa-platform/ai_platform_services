import { Pool, PoolConfig } from "pg";
import { logger } from "../utils/logger";
import dotenv from "dotenv";

dotenv.config();

/**
 * PostgreSQL Database Connection Pool
 * Manages database connections for the EBM service
 */
class Database {
  private static instance: Pool;

  /**
   * Get or create database connection pool
   */
  public static getPool(): Pool {
    if (!Database.instance) {
      // Moved into ai_platform_services: that app already configures the same
      // Postgres instance as a single DATABASE_URL, so prefer it and keep the
      // original discrete DATABASE_* vars as the fallback.
      const connectionString =
        process.env.EBM_DATABASE_URL || process.env.DATABASE_URL;

      const config: PoolConfig = {
        ...(connectionString ? { connectionString } : {}),
        ...(connectionString
          ? {}
          : {
              host: process.env.DATABASE_HOST || "localhost",
              port: parseInt(process.env.DATABASE_PORT || "5432"),
              database: process.env.DATABASE_NAME || "ebm_service",
              user: process.env.DATABASE_USER || "postgres",
              password: process.env.DATABASE_PASSWORD,
            }),
        ssl:
          process.env.DATABASE_SSL === "true"
            ? { rejectUnauthorized: false }
            : false,
        min: parseInt(process.env.DATABASE_POOL_MIN || "2"),
        max: parseInt(process.env.DATABASE_POOL_MAX || "10"),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      };

      Database.instance = new Pool(config);

      // Log successful connection
      Database.instance.on("connect", () => {
        logger.info("New database client connected to pool");
      });

      // Log errors
      Database.instance.on("error", (err) => {
        logger.error("Unexpected database pool error:", err);
      });

      logger.info("Database connection pool initialized", {
        host: config.host,
        port: config.port,
        database: config.database,
        poolSize: `${config.min}-${config.max}`,
      });
    }

    return Database.instance;
  }

  /**
   * Test database connection
   */
  public static async testConnection(): Promise<boolean> {
    try {
      const pool = Database.getPool();
      const result = await pool.query("SELECT NOW()");
      logger.info("Database connection test successful", {
        timestamp: result.rows[0].now,
      });
      return true;
    } catch (error) {
      logger.error("Database connection test failed:", error);
      return false;
    }
  }

  /**
   * Close all database connections
   */
  public static async close(): Promise<void> {
    if (Database.instance) {
      await Database.instance.end();
      logger.info("Database connection pool closed");
    }
  }
}

export default Database;

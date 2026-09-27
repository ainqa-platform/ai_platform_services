import Database from "../config/database";
import { PoolClient } from "pg";

interface ConfigRow {
  config_key: string;
  config_value: string;
  config_type: string;
  category: string;
  is_sensitive: boolean;
}

class ConfigService {
  /**
   * Get a configuration value from the database
   * Fetches on every call to ensure latest config is used
   * Falls back to process.env if database is unavailable
   */
  static async get(
    key: string,
    fallbackValue?: string
  ): Promise<string | undefined> {
    try {
      const pool = Database.getPool();
      const result = await pool.query<ConfigRow>(
        "SELECT config_value, config_type, is_sensitive FROM ebm_service_config WHERE config_key = $1",
        [key]
      );

      if (result.rows.length > 0) {
        const config = result.rows[0];

        // Log retrieval (but not sensitive values)
        if (!config.is_sensitive) {
          console.log(
            `[ConfigService] Retrieved ${key} from database: ${config.config_value}`
          );
        } else {
          console.log(
            `[ConfigService] Retrieved sensitive config ${key} from database`
          );
        }

        return this.convertValue(config.config_value, config.config_type);
      }

      // Not found in DB, try environment variable
      console.log(
        `[ConfigService] Config ${key} not found in database, checking environment variables`
      );
      return process.env[key] || fallbackValue;
    } catch (error) {
      console.warn(
        `[ConfigService] Database error fetching ${key}, falling back to environment:`,
        error
      );
      return process.env[key] || fallbackValue;
    }
  }

  /**
   * Get multiple configuration values at once (optimized single query)
   */
  static async getMany(
    keys: string[]
  ): Promise<Record<string, string | undefined>> {
    try {
      const pool = Database.getPool();
      const result = await pool.query<ConfigRow>(
        "SELECT config_key, config_value, config_type, is_sensitive FROM ebm_service_config WHERE config_key = ANY($1)",
        [keys]
      );

      const configs: Record<string, string | undefined> = {};

      result.rows.forEach((row: ConfigRow) => {
        configs[row.config_key] = this.convertValue(
          row.config_value,
          row.config_type
        );

        if (!row.is_sensitive) {
          console.log(
            `[ConfigService] Retrieved ${row.config_key} from database: ${row.config_value}`
          );
        }
      });

      // Fill missing keys from environment
      keys.forEach((key: string) => {
        if (!(key in configs)) {
          configs[key] = process.env[key];
          console.log(
            `[ConfigService] Config ${key} not in database, using environment`
          );
        }
      });

      return configs;
    } catch (error) {
      console.warn(
        `[ConfigService] Database error fetching multiple configs, falling back to environment:`,
        error
      );

      const configs: Record<string, string | undefined> = {};
      keys.forEach((key: string) => {
        configs[key] = process.env[key];
      });
      return configs;
    }
  }

  /**
   * Get all configurations by category
   */
  static async getByCategory(
    category: string,
    configName: string = "ebm_service_config"
  ): Promise<Record<string, string | undefined>> {
    try {
      const pool = Database.getPool();
      let result;

      result = await pool.query<ConfigRow>(
        "SELECT config_key, config_value, config_type, is_sensitive FROM " +
          configName +
          " WHERE category = $1",
        [category]
      );

      const configs: Record<string, string | undefined> = {};

      result.rows.forEach((row) => {
        configs[row.config_key] = this.convertValue(
          row.config_value,
          row.config_type
        );
      });

      console.log(
        `[ConfigService] Retrieved ${result.rows.length} configs from category: ${category}`
      );
      return configs;
    } catch (error) {
      console.warn(
        `[ConfigService] Database error fetching category ${category}:`,
        error
      );
      return {};
    }
  }


  /**
   * get all configuration value for given environment type
   */
  static async getByEnvType(
    envType: string,
    configName: string = "ebm_service_config"
  ): Promise<Record<string, string | undefined>> {
    try {
      const pool = Database.getPool();
      let result;

      result = await pool.query<ConfigRow>(
        "SELECT env_type, config_value FROM " +
          configName +
          " WHERE env_type = $1",
        [envType]
      );

      let configs: any = {};

      result.rows.forEach((row) => {
        configs=row.config_value
      });

      console.log(
        `[ConfigService] Retrieved ${result.rows.length} configs from envType: ${envType}`
      );
      return configs;
    } catch (error) {
      console.warn(
        `[ConfigService] Database error fetching envType ${envType}:`,
        error
      );
      return {};
    }
  }

  /**
   * Update a configuration value (with audit trail)
   */
  static async update(
    key: string,
    value: string,
    updatedBy: string = "system",
    changeReason?: string
  ): Promise<boolean> {
    const pool = Database.getPool();
    const client: PoolClient = await pool.connect();

    try {
      await client.query("BEGIN");

      // Update the configuration
      const result = await client.query(
        "UPDATE ebm_service_config SET config_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE config_key = $3",
        [value, updatedBy, key]
      );

      // If change_reason provided, update the audit record
      if (changeReason && result.rowCount && result.rowCount > 0) {
        await client.query(
          "UPDATE ebm_config_audit SET change_reason = $1 WHERE config_key = $2 AND changed_at = (SELECT MAX(changed_at) FROM ebm_config_audit WHERE config_key = $2)",
          [changeReason, key]
        );
      }

      await client.query("COMMIT");

      console.log(
        `[ConfigService] Updated config ${key} by ${updatedBy}${changeReason ? `: ${changeReason}` : ""}`
      );
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`[ConfigService] Error updating config ${key}:`, error);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Get configuration audit history
   */
  static async getAuditHistory(
    key: string,
    limit: number = 10
  ): Promise<any[]> {
    try {
      const pool = Database.getPool();
      const result = await pool.query(
        "SELECT * FROM ebm_config_audit WHERE config_key = $1 ORDER BY changed_at DESC LIMIT $2",
        [key, limit]
      );

      return result.rows;
    } catch (error) {
      console.error(
        `[ConfigService] Error fetching audit history for ${key}:`,
        error
      );
      return [];
    }
  }

  /**
   * Convert config value based on type
   */
  private static convertValue(value: string, type: string): string {
    // For now, return as string since process.env is always strings
    // Services can parse as needed (parseInt, JSON.parse, etc.)
    // Future enhancement: return typed values
    return value;
  }

  /**
   * Health check - verify database connectivity
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const pool = Database.getPool();
      const result = await pool.query(
        "SELECT COUNT(*) FROM ebm_service_config"
      );
      console.log(
        `[ConfigService] Health check passed: ${result.rows[0].count} configs in database`
      );
      return true;
    } catch (error) {
      console.error("[ConfigService] Health check failed:", error);
      return false;
    }
  }

  /**
   * Reload/clear any cache if we implement one in the future
   */
  static async reload(): Promise<void> {
    // No-op for now since we query on every request
    // Placeholder for future caching implementation
    console.log(
      "[ConfigService] Configuration reload requested (no cache to clear)"
    );
  }
}

export default ConfigService;

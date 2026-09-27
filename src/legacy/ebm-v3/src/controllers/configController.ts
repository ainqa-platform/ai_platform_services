import { Request, Response } from "express";
import ConfigService from "../services/configService";
import { logger } from "../utils/logger";

/**
 * Get a specific configuration value
 */
export const getConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { key } = req.params;
    const value = await ConfigService.get(key);

    if (value === undefined) {
      res.status(404).json({
        success: false,
        message: `Configuration key '${key}' not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        key,
        value,
      },
    });
  } catch (error) {
    logger.error("Error fetching config:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch configuration",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get all configurations (optionally filtered by category)
 */
export const getConfigsForGivenTable = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { configName,envType } = req.body;

    let configs;
   
      // Get all categories
      if(envType){
        configs = await ConfigService.getByEnvType(envType,configName);
      }
      else{
      configs = {
        model: await ConfigService.getByCategory("model",configName),
        api: await ConfigService.getByCategory("api",configName),
        feature: await ConfigService.getByCategory("feature",configName),
        environment: await ConfigService.getByCategory("environment",configName),
        server: await ConfigService.getByCategory("server",configName),
        logging: await ConfigService.getByCategory("logging",configName),
      };
    }
    

    res.json({
      success: true,
      data: configs,
    });
  } catch (error) {
    logger.error("Error fetching all configs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch configurations",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get all configurations (optionally filtered by category)
 */
export const getAllConfigs = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { category } = req.query;

    let configs;
    if (category && typeof category === "string") {
      configs = await ConfigService.getByCategory(category);
    } else {
      // Get all categories
      configs = {
        model: await ConfigService.getByCategory("model"),
        api: await ConfigService.getByCategory("api"),
        feature: await ConfigService.getByCategory("feature"),
        environment: await ConfigService.getByCategory("environment"),
        server: await ConfigService.getByCategory("server"),
        logging: await ConfigService.getByCategory("logging"),
      };
    }

    res.json({
      success: true,
      data: configs,
    });
  } catch (error) {
    logger.error("Error fetching all configs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch configurations",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Update a configuration value
 */
export const updateConfig = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { key } = req.params;
    const { value, updatedBy, changeReason } = req.body;

    if (value === undefined) {
      res.status(400).json({
        success: false,
        message: "Value is required",
      });
      return;
    }

    const success = await ConfigService.update(
      key,
      String(value),
      updatedBy || "api",
      changeReason
    );

    if (success) {
      logger.info(
        `Configuration updated: ${key} = ${value} by ${updatedBy || "api"}`
      );
      res.json({
        success: true,
        message: `Configuration '${key}' updated successfully`,
        data: {
          key,
          value,
          updatedBy: updatedBy || "api",
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to update configuration",
      });
    }
  } catch (error) {
    logger.error("Error updating config:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update configuration",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get audit history for a configuration
 */
export const getConfigAuditHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { key } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const history = await ConfigService.getAuditHistory(key, limit);

    res.json({
      success: true,
      data: {
        key,
        history,
      },
    });
  } catch (error) {
    logger.error("Error fetching audit history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch audit history",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Health check for configuration service
 */
export const configHealthCheck = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const isHealthy = await ConfigService.healthCheck();

    res.json({
      success: true,
      healthy: isHealthy,
      message: isHealthy
        ? "Configuration service is healthy"
        : "Configuration service has issues",
    });
  } catch (error) {
    logger.error("Config health check failed:", error);
    res.status(500).json({
      success: false,
      healthy: false,
      message: "Configuration service health check failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

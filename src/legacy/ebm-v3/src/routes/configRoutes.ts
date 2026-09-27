import { Router } from "express";
import {
  getConfig,
  getAllConfigs,
  updateConfig,
  getConfigAuditHistory,
  configHealthCheck,
  getConfigsForGivenTable,
} from "../controllers/configController";

const router = Router();

/**
 * @swagger
 * /api/config/health:
 *   get:
 *     summary: Health check for configuration service
 *     tags: [Configuration]
 *     responses:
 *       200:
 *         description: Configuration service health status
 */
router.get("/health", configHealthCheck);

/**
 * @swagger
 * /api/config:
 *   get:
 *     summary: Get all configurations
 *     tags: [Configuration]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category (model, api, feature, etc.)
 *     responses:
 *       200:
 *         description: List of all configurations
 */
router.get("/", getAllConfigs);


/**
 * @swagger
 * /api/config:
 *   post:
 *     summary: Get all configurations
 *     tags: [Configuration]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category (model, api, feature, etc.)
 *     responses:
 *       200:
 *         description: List of all configurations
 */
router.post("/", getConfigsForGivenTable);


/**
 * @swagger
 * /api/config/{key}:
 *   get:
 *     summary: Get a specific configuration value
 *     tags: [Configuration]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Configuration key
 *     responses:
 *       200:
 *         description: Configuration value
 *       404:
 *         description: Configuration not found
 */
router.get("/:key", getConfig);

/**
 * @swagger
 * /api/config/{key}:
 *   put:
 *     summary: Update a configuration value
 *     tags: [Configuration]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Configuration key
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - value
 *             properties:
 *               value:
 *                 type: string
 *                 description: New configuration value
 *               updatedBy:
 *                 type: string
 *                 description: Username/identifier of person making change
 *               changeReason:
 *                 type: string
 *                 description: Reason for the change
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *       400:
 *         description: Invalid request
 */
router.put("/:key", updateConfig);

/**
 * @swagger
 * /api/config/{key}/audit:
 *   get:
 *     summary: Get audit history for a configuration
 *     tags: [Configuration]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Configuration key
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of audit records to return
 *     responses:
 *       200:
 *         description: Audit history for the configuration
 */
router.get("/:key/audit", getConfigAuditHistory);

export default router;

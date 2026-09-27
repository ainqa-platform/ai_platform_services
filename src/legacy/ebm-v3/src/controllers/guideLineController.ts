import { Request, Response } from "express";
//const pool = require("./db");
import Database from "../config/database";
import { PoolClient } from "pg";

export const insertIntoTable = async (req: Request, res: Response) => {
  const pool = Database.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const { table, data } = req.body;

    const columns = Object.keys(data);
    const values = Object.values(data);

    const placeholders = columns.map((_, i) => `$${i + 1}`).join(",");

    const query = `
    INSERT INTO ${table} (${columns.join(",")})
    VALUES (${placeholders})
    RETURNING *
  `;

    try {
      const result = await client.query(query, values);
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } catch (error) {
    res.status(500).json({ message: "Error inserting into table", error });
  } finally {
    client.release();
  }
};

export const searchIntoTable = async (req: Request, res: Response) => {
  const pool = Database.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const { table, where = {}, limit = 50, offset = 0 } = req.body;

    // if (!allowedTables.includes(table)) {
    //     return res.status(400).json({ message: "Invalid table name" });
    // }

    const keys = Object.keys(where);
    const values = Object.values(where);

    let condition = "";
    if (keys.length > 0) {
      condition =
        "WHERE " + keys.map((k, i) => `"${k}" = $${i + 1}`).join(" AND ");
    }

    const query = `
    SELECT * FROM public."${table}"
    ${condition}
    ORDER BY id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

    try {
      const result = await client.query(query, values);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } catch (error) {
    res.status(500).json({ message: "Error searching into table", error });
  } finally {
    client.release();
  }
};

export const updateIntoTable = async (req: Request, res: Response) => {
  const pool = Database.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const { table, data, where } = req.body;

    const dataKeys = Object.keys(data);
    const dataValues = Object.values(data);

    const whereKeys = Object.keys(where);
    const whereValues = Object.values(where);

    const setClause = dataKeys.map((k, i) => `${k} = $${i + 1}`).join(",");

    const whereClause = whereKeys
      .map((k, i) => `${k} = $${dataKeys.length + i + 1}`)
      .join(" AND ");

    const query = `
    UPDATE ${table}
    SET ${setClause}
    WHERE ${whereClause}
    RETURNING *
  `;

    try {
      const result = await client.query(query, [...dataValues, ...whereValues]);
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } catch (error) {
    res.status(500).json({ message: "Error updating into table", error });
  } finally {
    client.release();
  }
};
export const deleteFromTable = async (req: Request, res: Response) => {
  const pool = Database.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const { table, where } = req.body;

    const whereKeys = Object.keys(where);
    const whereValues = Object.values(where);

    const whereClause = whereKeys
      .map((k, i) => `${k} = $${i + 1}`)
      .join(" AND ");

    const query = `
    UPDATE ${table}
    SET activestatus = false
    WHERE ${whereClause}
    RETURNING *
  `;

    try {
      const result = await client.query(query, whereValues);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } catch (error) {
    res.status(500).json({ message: "Error deleting from table", error });
  } finally {
    client.release();
  }
};

// Guideline-specific CRUD operations for guideline_files table
export const guidelineInsert = async (req: Request, res: Response) => {
  debugger;
  const pool = Database.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const {
      guidelineId,
      guidelineName,
      guidelineDiagnosis,
      guidelineFile,
      activestatus = true,
    } = req.body;

    // Detect column type for guidelineFile; if json/jsonb, ensure we pass valid JSON
    const colTypeRes = await client.query(
        `
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'guideline_files'
      AND column_name = 'guidelineFile'
    `
      );

    console.log(colTypeRes.rows," ColTypeRes");

    const colType = colTypeRes.rows[0]?.data_type || null;

    let fileParam: any = guidelineFile;
    if (colType && (colType === "json" || colType === "jsonb")) {
      // If it's already an object or array, stringify; if it's a plain string, also stringify so Postgres accepts it as JSON string
      try {
        if (typeof guidelineFile === "string") {
          // If string looks like JSON, keep it, else stringify to produce a valid JSON string
          const s = guidelineFile.trim();
          if (
            s.startsWith("{") ||
            s.startsWith("[") ||
            s === "null" ||
            s === "true" ||
            s === "false" ||
            /^".*"$/.test(s)
          ) {
            fileParam = guidelineFile;
          } else {
            fileParam = JSON.stringify(guidelineFile);
          }
        } else {
          fileParam = JSON.stringify(guidelineFile);
        }
      } catch (e) {
        fileParam = JSON.stringify(guidelineFile);
      }
    }

    const query = `
            INSERT INTO public.guideline_files ("guidelineId", "guidelineName", "guidelineDiagnosis", "guidelineFile", "activestatus")
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
          `;

    try {
      const result = await client.query(query, [
        guidelineId,
        guidelineName,
        guidelineDiagnosis,
        fileParam,
        activestatus,
      ]);
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } catch (error) {
    res.status(500).json({ message: "Error inserting guideline", error });
  } finally {
    client.release();
  }
};

export const guidelineSearch = async (req: Request, res: Response) => {
  const pool = Database.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const {
      guidelineId,
      guidelineName,
      guidelineDiagnosis,
      limit = 50,
      offset = 0,
    } = req.body;

    let condition = "WHERE activestatus = true";
    const values: any[] = [];
    let paramCount = 1;

    if (guidelineId) {
      condition += ` AND "guidelineId" = $${paramCount}`;
      values.push(guidelineId);
      paramCount++;
    }
    if (guidelineName) {
      condition += ` AND "guidelineName" ILIKE $${paramCount}`;
      values.push(`%${guidelineName}%`);
      paramCount++;
    }
    if (guidelineDiagnosis) {
      condition += ` AND "guidelineDiagnosis" ILIKE $${paramCount}`;
      values.push(`%${guidelineDiagnosis}%`);
      paramCount++;
    }

    const query = `
    SELECT * FROM public.guideline_files
    ${condition}
    LIMIT ${limit} OFFSET ${offset}
  `;

    try {
      const result = await client.query(query, values);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } catch (error) {
    res.status(500).json({ message: "Error searching guidelines", error });
  } finally {
    client.release();
  }
};

export const guidelineUpdate = async (req: Request, res: Response) => {
  const pool = Database.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const {
      id,
      guidelineId,
      guidelineName,
      guidelineDiagnosis,
      guidelineFile,
      activestatus,
    } = req.body;

    if (!id) {
      return res.status(400).json({ message: "ID is required for update" });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (guidelineId !== undefined) {
      updates.push(`"guidelineId" = $${paramCount}`);
      values.push(guidelineId);
      paramCount++;
    }
    if (guidelineName !== undefined) {
      updates.push(`"guidelineName" = $${paramCount}`);
      values.push(guidelineName);
      paramCount++;
    }
    if (guidelineDiagnosis !== undefined) {
      updates.push(`"guidelineDiagnosis" = $${paramCount}`);
      values.push(guidelineDiagnosis);
      paramCount++;
    }
    if (guidelineFile !== undefined) {
      updates.push(`"guidelineFile" = $${paramCount}`);
      values.push(guidelineFile);
      paramCount++;
    }
    if (activestatus !== undefined) {
      updates.push(`"activestatus" = $${paramCount}`);
      values.push(activestatus);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    values.push(id);
    const setClause = updates.join(", ");

    const query = `
        UPDATE public.guideline_files
        SET ${setClause}
        WHERE "id" = $${paramCount}
        RETURNING *
    `;

    try {
      const result = await client.query(query, values);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Guideline not found" });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } catch (error) {
    res.status(500).json({ message: "Error updating guideline", error });
  } finally {
    client.release();
  }
};

export const guidelineDelete = async (req: Request, res: Response) => {
  const pool = Database.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ message: "ID is required for deletion" });
    }

    const query = `
        UPDATE public.guideline_files
        SET "activestatus" = false
        WHERE "id" = $1
        RETURNING *
    `;

    try {
      const result = await client.query(query, [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Guideline not found" });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } catch (error) {
    res.status(500).json({ message: "Error deleting guideline", error });
  } finally {
    client.release();
  }
};

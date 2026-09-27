import { Router } from "express";
import {
  insertIntoTable,
  searchIntoTable, updateIntoTable, deleteFromTable,
  guidelineInsert,
  guidelineSearch,
  guidelineUpdate,
  guidelineDelete
} from "../controllers/guideLineController";

const router = Router();


router.post("/insert", insertIntoTable);
router.post("/search", searchIntoTable);
router.post("/update", updateIntoTable);
router.post("/delete", deleteFromTable);

// Guideline-specific routes for guideline_files table
router.post("/guideline/insert", guidelineInsert);
router.post("/guideline/search", guidelineSearch);
router.post("/guideline/update", guidelineUpdate);
router.post("/guideline/delete", guidelineDelete);

export default router;

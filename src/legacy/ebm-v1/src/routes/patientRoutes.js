const express = require("express");
const patientController = require("../controllers/patientController");

const router = express.Router();

// Only the /api/patients/* routes ainqa-ai-platform calls -- see the header
// comment in ../controllers/patientController.js.
router.post("/callgpt", patientController.callGPT);
router.post("/callpista", patientController.callPistaAPI);
router.post("/postpista", patientController.postPistaAPI);

module.exports = router;

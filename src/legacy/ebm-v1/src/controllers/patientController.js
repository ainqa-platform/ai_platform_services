// Extracted verbatim from ebm-service-v1's src/controllers/patientController.js.
//
// That file is a single ~1200-line controller with 16 eager top-level requires,
// so importing it pulled in the whole diagnosis/RAG/consolidation stack (and its
// prompt + rule assets) even though ainqa-ai-platform only ever calls these
// three handlers:
//
//   POST /api/patients/callgpt    <- configData.EBM_SERVICE_GPT_API
//   POST /api/patients/callpista  <- configData.EBM_SERVICE_PISTA_API
//   POST /api/patients/postpista  <- configData.PISTA_SAVE_API
//
// The handler bodies below are unmodified; only the surrounding imports are
// narrowed to what they actually reference. If another /api/patients/* route is
// ever needed, port it from the original service the same way.
const axios = require("axios");

// Pista (pistha.kghospital.com) bearer tokens. These were hardcoded in
// ebm-service-v1; moved to the environment so the token can be rotated
// without a code change. Set in .env -- see .env.example.
//   PISTA_LOOKUP_API_TOKEN -> /api/patients/callpista (read: admission details)
//   PISTA_SAVE_API_TOKEN   -> /api/patients/postpista (write: discharge summary)

const { getParamsFromDb } = require("../helpers/paramsMapping");
const {
  createLogHeader,
  createLogStep,
  createLogData,
} = require("../utils/loggingUtils");

async function callGPT(req, res) {
  const { modelname, userdata, prompt, imageUrl } = req.body;

  let logHeaderId = await createLogHeader({ personid: "p/10" }, "");
  const apiParamsUrl = await getParamsFromDb("PATIENTSUMMARY");
  const url = apiParamsUrl.OPENAI_CHAT_API_URL; // "https://api.openai.com/v1/chat/completions";

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  };

  let imageContent = null;

  // 🔹 If imageUrl is provided, fetch and convert it to base64
  if (imageUrl) {
    try {
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) throw new Error("Failed to fetch image");

      const arrayBuffer = await imgResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Image = buffer.toString("base64");

      // assume jpeg (you can detect from headers if needed)
      imageContent = {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${base64Image}` },
      };
    } catch (err) {
      console.error("Image fetch/convert error:", err.message);
    }
  }

  const body = {
    model: modelname,
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: [{ type: "text", text: userdata }, imageContent].filter(
          Boolean
        ), // remove null if no image
      },
    ],
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (logHeaderId) {
      const step1LogId = await createLogStep(logHeaderId, {
        orderSequence: "1",
        stepName: "Getting response from llm",
        startTime: 0,
        endTime: 0,
        responseTime: 0,
      });

      if (step1LogId) {
        await createLogData(logHeaderId, step1LogId, {
          inputData: body,
          outputData: { data },
        });
      }
    }

    res.status(200).json({
      data: data?.choices?.[0]?.message?.content || null,
    });
  } catch (error) {
    if (logHeaderId) {
      const step1LogId = await createLogStep(logHeaderId, {
        orderSequence: "1",
        stepName: "Getting response from llm-catch error",
        startTime: 0,
        endTime: 0,
        responseTime: 0,
      });

      if (step1LogId) {
        await createLogData(logHeaderId, step1LogId, {
          inputData: { body: req.body },
          outputData: { data: error.message },
        });
      }
    }

    res.status(500).json({
      data: error.message,
    });
  }
}

async function callPistaAPI(req, res) {
  try {
    const { mrn } = req.body;
    const response = await axios.post(
      "https://pistha.kghospital.com/PISTHA/web/index.php?r=api%2Fapi-ainqa%2Fpatient-admission-details",
      {
        MRN: mrn,
        idsourcecode: "CodingMaster/10524",
        idnumber: "",
        name: "",
        telecom: "",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${process.env.PISTA_LOOKUP_API_TOKEN}`,
        },
      }
    );
    return res.status(200).json({ data: response?.data?.data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function postPistaAPI(req, res) {
  try {
    const inputPayload = req.body;
    const response = await axios.post(
      "https://pistha.kghospital.com/PISTHA/web/index.php?r=api/api-ainqa/save-discharge-summary-data",
      inputPayload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${process.env.PISTA_SAVE_API_TOKEN}`,
        },
      }
    );
    return res.status(200).json({ data: response?.data });
  } catch (error) {
    return res.status(500).json({ error: error });
  }
}

module.exports = {
  callGPT,
  callPistaAPI,
  postPistaAPI,
};

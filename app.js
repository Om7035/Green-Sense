require("dotenv").config();
const express = require("express");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const cors = require("cors"); // Add this line
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 5000;

// Configure CORS
app.use(cors()); // Add this line

// Configure multer
const upload = multer({ dest: "upload/" });
app.use(express.json({ limit: "10mb" }));

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI("AIzaSyBB79MwndfkzWwlYLjXg9529SYow9oNFA0");
app.use(express.static("public"));

// Routes
// Analyze
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    const imagePath = req.file.path;
    const imageData = await fsPromises.readFile(imagePath, { encoding: "base64" });
    console.log(`Received image of size: ${imageData.length} bytes`);

    // Gemini API call and response handling
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent([
      "Analyze this plant image and provide detailed analysis.",
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: imageData,
        },
      },
    ]);

    // Ensure the response contains valid content
    if (!result || !result.response || typeof result.response.text !== "function") {
      throw new Error("Invalid API response");
    }

    const plantInfo = result.response.text();
    await fsPromises.unlink(imagePath);
    res.json({ result: plantInfo, image: `data:${req.file.mimetype};base64,${imageData}` });
  } catch (error) {
    console.error("Error analyzing image:", error);
    res.status(500).json({ error: "An error occurred while analyzing the image" });
  }
});

// Download PDF
app.post("/download", express.json(), async (req, res) => {
  const { result, image } = req.body;
  try {
    // Ensure the reports directory exists
    const reportsDir = path.join(__dirname, "reports");
    await fsPromises.mkdir(reportsDir, { recursive: true });
    // Generate PDF
    const filename = `plant_analysis_report_${Date.now()}.pdf`;
    const filePath = path.join(reportsDir, filename);
    const writeStream = fs.createWriteStream(filePath);
    const doc = new PDFDocument();
    doc.pipe(writeStream);
    // Add content to the PDF
    doc.fontSize(24).text("Plant Analysis Report", {
      align: "center",
    });
    doc.moveDown();
    doc.fontSize(24).text(`Date: ${new Date().toLocaleDateString()}`);
    doc.moveDown();
    doc.fontSize(14).text(result, { align: "left" });
    // Insert image to the PDF
    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      doc.moveDown();
      doc.image(buffer, {
        fit: [500, 300],
        align: "center",
        valign: "center",
      });
    }
    doc.end();
    // Wait for the PDF to be created
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
    res.download(filePath, (err) => {
      if (err) {
        res.status(500).json({ error: "Error downloading the PDF report" });
      }
      fsPromises.unlink(filePath);
    });
  } catch (error) {
    console.error("Error generating PDF report:", error);
    res
      .status(500)
      .json({ error: "An error occurred while generating the PDF report" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

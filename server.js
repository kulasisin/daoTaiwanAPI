require("dotenv").config();
const dotenv = require("dotenv");
const express = require("express");
const fs = require("fs");
require("./connections");
const mongoose = require("mongoose");
const formidable = require("formidable");
const path = require("path");
const { Storage } = require("@google-cloud/storage");
const cors = require("cors");
const app = express();
const axios = require("axios");
const sharp = require("sharp");
const PORT = process.env.PORT || 8080;

app.use(
  cors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders:
      "Content-Type, Authorization, Content-Length, X-Requested-With",
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);
const textureStorage = new Storage({
  keyFilename: path.join(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS),
  projectId: "dao-420504",
});
const textureBucket = textureStorage.bucket(
  process.env.GCLOUD_STORAGE_BUCKET_TEXTURE
);

const resultStorage = new Storage({
  keyFilename: path.join(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS),
  projectId: "dao-420504",
});
const resultBucket = resultStorage.bucket(
  process.env.GCLOUD_STORAGE_BUCKET_RESULT
);
const texutureImage = require("./models/textureImages");
const resultImage = require("./models/resultImages");

app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.post("/result/upload", async (req, res) => {
  const form = new formidable.IncomingForm();
  try {
    form.parse(req, async (err, fields, files) => {
      if (!files.imageData || !files.imageData[0]) {
        return res.status(400).send("No image file uploaded.");
      }
      // console.log(fields);
      const { originalImageId } = fields;
      // console.log(originalImageId);
      const originalImage = await texutureImage.findById(originalImageId[0]);
      if (!originalImage) {
        return res.status(404).json({ error: "Original image not found." });
      }

      const file = files.imageData[0];
      const filePath = file.filepath;
      const originalId = originalImageId[0];
      const fileType = originalImage.category;
      const fileName = `processed-${file.originalFilename}`;
      const resultBlob = resultBucket.file(fileName);
      const resultBlobStream = resultBlob.createWriteStream({
        resumable: false,
      });

      resultBlobStream.on("error", (err) => {
        console.error(err);
        res.status(500).json({ error: "Error writing to GCS." });
      });

      resultBlobStream.on("finish", async () => {
        const publicResultUrl = `https://storage.googleapis.com/${resultBucket.name}/${resultBlob.name}`;
        console.log( publicResultUrl);
        try {
          const newresultImage = new resultImage({
            originalId: originalId,
            filename: fileName,
            url: publicResultUrl,
            category: fileType,
            gcsId: resultBlob.id,
          });
          await newresultImage.save();
          res.json({
            message: "File uploaded successfully",
            data: newresultImage,
          });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Error saving to database." });
        }
      });

      resultBlobStream.end(fs.readFileSync(filePath));
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to upload image to GCS and save metadata to MongoDB.",
    });
  }
});

app.get("/images", async (req, res) => {
  const texutureImages = await texutureImage.find();
  res.json({ status: "success", data: texutureImages });
});

app.get("/results", async (req, res) => {
  try {
    const resultImages = await resultImage.find();
    res.json({ status: "success", data: resultImages });
  } catch (error) {
    console.error("Failed to fetch result images: ", error);
    res.status(500).json({ error: "Failed to fetch result images." });
  }
});
app.get("/results/:id", async (req, res) => {
  const originalId = req.params.id;
  try {
    const resultImages = await resultImage.find({ originalId: originalId });
    if (resultImages.length === 0) {
      return res
        .status(404)
        .json({ message: "No result images found for the given original ID." });
    }
    res.json({ status: "success", data: resultImages });
  } catch (error) {
    console.error("Failed to fetch result images: ", error);
    res.status(500).json({ error: "Failed to fetch result images." });
  }
});
app.post("/upload", (req, res) => {
  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (!files.image || !files.image[0]) {
      return res.status(400).send("No image file uploaded.");
    }
    const file = files.image[0];
    const filePath = file.filepath;
    const originalFileName = file.originalFilename;
    const fileType = Array.isArray(fields.type) ? fields.type[0] : fields.type;
    const fileName = `${fileType}-${originalFileName}`;
    const textureBlob = textureBucket.file(fileName);
    const textureBlobStream = textureBlob.createWriteStream({
      resumable: false,
    });

    textureBlobStream.on("error", (err) => {
      console.error(err);
      res.status(500).json({ error: "Error writing to GCS." });
    });

    textureBlobStream.on("finish", async () => {
      const publicUrl = `https://storage.googleapis.com/${textureBucket.name}/${textureBlob.name}`;

      try {
        const newtexutureImage = new texutureImage({
          filename: fileName,
          url: publicUrl,
          category: fileType,
          gcsId: textureBlob.id,
        });
        await newtexutureImage.save();
        res.json({
          message: "File uploaded successfully",
          data: newtexutureImage,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error saving to database." });
      }
    });

    textureBlobStream.end(fs.readFileSync(filePath));
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = app;

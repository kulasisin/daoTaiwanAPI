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

app.post("/result/upload/test", async (req, res) => {
  const { originalImageId } = req.body;

  try {
    // 从 MongoDB 获取原始图片信息
    const originalImage = await texutureImage.findById(originalImageId);
    if (!originalImage) {
      return res.status(404).json({ error: "Original image not found." });
    }

    // 下载图片
    const response = await axios({
      method: "get",
      url: originalImage.url,
      responseType: "arraybuffer",
    });
    const originalData = response.data;

    // 处理图片 (例如，转换为黑白)
    const processedData = await sharp(originalData).grayscale().toBuffer();

    // 上传处理后的图片到新的 GCS bucket
    const newFileName = `processed-${originalImage.filename}`;
    const file = resultBucket.file(newFileName);
    await file.save(processedData, {
      resumable: false,
      validation: false,
    });
    // 获取新图片的公共 URL
    await file.makePublic();
    const publicUrl = file.publicUrl();

    // 保存结果到 MongoDB
    const newresultImage = new resultImage({
      originalId: originalImageId,
      filename: newFileName,
      url: publicUrl,
      category: originalImage.category,
      gcsId: file.id,
      originalImageId: originalImageId,
    });
    await newresultImage.save();

    res.json({
      message: "Image processed and uploaded successfully",
      data: newresultImage,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process and upload image." });
  }
});

app.post("/result/upload", async (req, res) => {
  const { originalImageId, imageData } = req.body;

  try {
    // 从 MongoDB 获取原始图片信息
    const originalImage = await texutureImage.findById(originalImageId);
    if (!originalImage) {
      return res.status(404).json({ error: "Original image not found." });
    }

    // 生成新文件名
    const newFileName = `processed-${originalImage.filename}`;

    // 上传处理后的图片到新的 GCS bucket
    const file = resultBucket.file(newFileName);
    await file.save(imageData, {
      resumable: false,
      validation: false,
    });

    // 获取新图片的公共 URL
    await file.makePublic();
    const publicUrl = file.publicUrl();

    // 保存结果到 MongoDB
    const newresultImage = new resultImage({
      originalId: originalImageId,
      filename: newFileName,
      url: publicUrl,
      category: originalImage.category,
      gcsId: file.id,
      originalImageId: originalImageId,
    });
    await newresultImage.save();

    res.json({
      message:
        "Image uploaded to GCS and metadata saved to MongoDB successfully",
      data: newresultImage,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({
        error: "Failed to upload image to GCS and save metadata to MongoDB.",
      });
  }
});
// Handle OPTIONS requests for CORS pre-flight checks
// app.options("*", (req, res) => {
//   res
//     .set({
//       "Access-Control-Allow-Headers":
//         "Content-Type, Authorization, Content-Length, X-Requested-With",
//       "Access-Control-Allow-Origin": "*",
//       "Access-Control-Allow-Methods": "PATCH, POST, GET, OPTIONS, DELETE",
//       "Content-Type": "application/json",
//     })
//     .send();
// });

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = app;

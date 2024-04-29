require("dotenv").config();
require("./connections");
const express = require("express");
const fs = require("fs");
const http = require("http");
const formidable = require("formidable");
const path = require("path");
const { Storage } = require("@google-cloud/storage");
const cors = require("cors");
const multer = require("multer");
const PORT = process.env.PORT || 8080;

const socket = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = socket(server, {
  cors: {
    // origin: "http://localhost:3000",
    origin: "*",
  },
});



// 中間件設定
app.use(express.json()); // 解析 JSON 格式的請求主體
app.use(express.urlencoded({ extended: true })); // 解析 URL 編碼的請求主體
// app.use(cors());
app.use(
  cors({
    origin: "*", // 允許所有來源的跨來源請求 //需要設定
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // 允許的 HTTP 方法
    allowedHeaders:
      "Content-Type, Authorization, Content-Length, X-Requested-With", // 允許的標頭欄位
    preflightContinue: false, // 不繼續處理 preflight 請求
    optionsSuccessStatus: 204, // 設定成功處理 OPTIONS 請求的狀態碼
  })
);

// WebSocket 連線處理
io.on("connection", function (socket) {
  console.log("用戶進行連線成功！");
  // 當客戶端連線成功時發送歡迎訊息
  socket.emit("message", "連線成功！歡迎使用 DAO Taiwan Socket。");

  // 接收客戶端發送的訊息
  socket.on("message", function (msg) {
    console.log("Received message: ", msg);
    socket.emit("message", "Server received message: " + msg);
  });

  // 監聽來自網頁的開燈請求
  socket.on("light-on", function (msg) {
    console.log("收到網頁使用者觸發開燈請求:", msg);
    // 向Unity端發送開燈請求通知
    io.emit("light-on", { message: "網頁使用者觸發開燈請求", _id: msg._id });
  });

  // 監聽來自網頁的關燈請求
  socket.on("light-off", function (msg) {
    console.log("收到網頁使用者觸發關燈請求:", msg);
    // 向Unity端發送開燈請求通知
    io.emit("light-off", { message: "網頁使用者觸發關燈請求", _id: msg._id });
  });
});

// Google Cloud Storage 設定
const textureStorage = new Storage({
  keyFilename: path.join(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS), // 設定金鑰檔案路徑
  projectId: "dao-420504", // 設定專案 ID
});
const textureBucket = textureStorage.bucket(
  process.env.GCLOUD_STORAGE_BUCKET_TEXTURE
); // 指定儲存桶名稱

const resultStorage = new Storage({
  keyFilename: path.join(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS), // 設定金鑰檔案路徑
  projectId: "dao-420504", // 設定專案 ID
});
const resultBucket = resultStorage.bucket(
  process.env.GCLOUD_STORAGE_BUCKET_RESULT
); // 指定儲存桶名稱

const texutureImage = require("./models/textureImages"); // 載入貼圖影像模型
const resultImage = require("./models/resultImages"); // 載入處理結果影像模型

// 設定 Multer 儲存到臨時目錄 /uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "/uploads/"); // 上傳文件到 /uploads 目錄
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname); // 檔案加上時間戳記
  },
});
const upload = multer({ storage: storage });

// 處理結果影像上傳
app.post("/result/upload", upload.single("imageData"), async (req, res) => {
  try {
    // 檢查是否有上傳的影像檔案
    if (!req.file) {
      return res.status(400).send("No image file uploaded.");
    }
    const imageData = req.file;
    console.log(req.body);
    const originalImageId = req.body.originalImageId;

    // 取得資料庫中原始貼圖資料
    const originalImage = await texutureImage.findById(originalImageId);
    if (!originalImage) {
      return res.status(404).json({ error: "Original image not found." });
    }
    const filePath = imageData.path;
    const originalId = originalImageId;
    const fileType = originalImage.category;
    const timestamp = Date.now(); // 取得時間戳記
    const fileName = `processed-${timestamp}-${imageData.originalname}`; // 加上時間戳記
    const resultBlob = resultBucket.file(fileName);
    const resultBlobStream = resultBlob.createWriteStream({
      resumable: false,
    });

    // 處理上傳的影像資料流
    resultBlobStream.on("error", (err) => {
      console.error(err);
      res.status(500).json({ error: "Error writing to GCS." });
    });

    // 完成上傳後處理
    resultBlobStream.on("finish", async () => {
      const publicResultUrl = `https://storage.googleapis.com/${resultBucket.name}/${resultBlob.name}`;
      console.log(publicResultUrl);
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

    // 寫入檔案資料
    resultBlobStream.end(fs.readFileSync(filePath));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to upload image to GCS and save metadata to MongoDB.",
    });
  }
});

// 提供貼圖影像列表查詢 API
app.get("/images", async (req, res) => {
  const texutureImages = await texutureImage.find();
  res.json({ status: "success", data: texutureImages });
});

// 提供特定 ID 的材質圖片查詢 API
app.get("/image/:id", async (req, res) => {
  const textureImageId = req.params.id;
  try {
    // 在資料庫中查詢指定 ID 的材質圖片
    const textureImage = await texutureImage.findById(textureImageId);
    if (!textureImage) {
      return res.status(404).json({ message: "Texture image not found." });
    }
    // 若找到，則回傳材質圖片資訊
    res.json({ status: "success", data: textureImage });
  } catch (error) {
    console.error("Failed to fetch texture image: ", error);
    res.status(500).json({ error: "Failed to fetch texture image." });
  }
});

// 提供處理結果影像列表查詢 API
app.get("/results", async (req, res) => {
  try {
    const resultImages = await resultImage.find();
    res.json({ status: "success", data: resultImages });
  } catch (error) {
    console.error("Failed to fetch result images: ", error);
    res.status(500).json({ error: "Failed to fetch result images." });
  }
});

// 提供指定貼圖的處理結果影像列表查詢 API
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

// 處理貼圖影像上傳
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
        const savedImage = await newtexutureImage.save(); // 儲存資料並取得回傳的物件
        const savedId = savedImage._id; // 取得儲存後的 ID
        const message = "新貼圖上傳資料庫成功，等待發送成果圖";
        io.emit("new-texture", { message: message, _id: savedId }); //發送 socket id 訊息給客戶端
        res.json({
          message: "新貼圖上傳資料庫成功",
          data: newtexutureImage,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "新貼圖上傳資料庫失敗" });
      }
    });

    textureBlobStream.end(fs.readFileSync(filePath));
  });
});

// 啟動伺服器監聽指定埠口
server.listen(PORT, () => console.log(`伺服器正在監聽埠口 ${PORT}`));
module.exports = app;

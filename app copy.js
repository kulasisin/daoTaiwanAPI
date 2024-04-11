const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
// const storage = multer.memoryStorage();
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public");
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + "-" + Date.now());
  },
});
const upload = multer({ storage: storage });
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

// 連接到 MongoDB 資料庫
// mongoose.connect("mongodb://localhost:27017/wanstreet");

mongoose.connect(
  "mongodb+srv://107702039:RlvtXSIv10Yx0lQS@daotaiwan.sxdo6zy.mongodb.net/daoTaiwan"
);
const db = mongoose.connection;

// 定義圖片資料的模型
const ImageSchema = new mongoose.Schema(
  {
    filename: String,
    path: String,
    imageBase64: String,
  },
  { collection: "textureImages" }
);

const Image = mongoose.model("Image", ImageSchema);

// // 設置 Multer 上傳存儲位置和文件名
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "./uploads/");
//     console.log("創建資料夾");
//   },
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + "-" + file.originalname);
//   },
// });

// const upload = multer({ storage: storage });

// 解析 application/x-www-form-urlencoded 格式的請求主體
app.use(express.urlencoded({ extended: true }));
// 解析 application/json 格式的請求主體
app.use(express.json());

// 靜態資源路徑
app.use("/uploads", express.static("uploads"));

// 圖片上傳路由
app.post("/draw", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("未上傳檔案");
  }

  try {
    const imgBase64 = Buffer.from(req.file.buffer).toString("base64");
    const image = new Image({
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      imageBase64: imgBase64,
    });

    await image.save();
    res.status(200).send("圖片已成功上傳和儲存");
  } catch (error) {
    console.error(error);
    res.status(500).send("儲存圖片時發生錯誤");
  }
});
// 讀取所有圖片資料路由
app.get("/images", async (req, res) => {
  try {
    const images = await Image.find();
    res.status(200).json(
      images.map((img) => ({
        filename: img.filename,
        src: `data:image/jpeg;base64,${img.imageBase64}`,
      }))
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("讀取圖片資料時發生錯誤");
  }
});

// 設置靜態資源目錄
app.use(express.static(path.join(__dirname, "public")));

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`伺服器正在監聽 ${PORT} port...`);
});

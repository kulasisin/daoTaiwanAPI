var http = require("http");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const formidable = require("formidable");
const errHandle = require("./errorHandle");
const express = require("express");
const cors = require("cors");

const corsOptions = {
  origin: "http://localhost:3000",
};

const app = express();
app.use(cors(corsOptions));

const path = require("path");

// MongoDB Connection
mongoose.connect(
  "mongodb+srv://107702039:RlvtXSIv10Yx0lQS@daotaiwan.sxdo6zy.mongodb.net/daoTaiwan"
);

// Image Schema
const ImageSchema = new mongoose.Schema(
  {
    filename: String,
    imageBase64: String,
  },
  { collection: "textureImages" }
);
const Image = mongoose.model("Image", ImageSchema);

const headers = {
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Content-Length, X-Requested-With",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, POST, GET,OPTIONS,DELETE",
  "Content-Type": "application/json",
};

function convertToBase64(file) {
  console.log(file);
  console.log("path:", file[0].filepath); // 输出上传的文件详情
  return new Promise((resolve, reject) => {
    const fs = require("fs");
    fs.readFile(file[0].filepath, (err, data) => {
      if (err) reject(err);
      else resolve(data.toString("base64"));
    });
  });
}

const requestListener = async (req, res) => {
  if (req.url === "/images" && req.method === "GET") {
    try {
      const images = await Image.find();
      res.writeHead(200, headers);
      res.write(
        JSON.stringify({
          status: "success",
          data: images.map((img) => ({
            filename: img.filename,
            imageBase64: img.imageBase64,
          })),
        })
      );
      res.end();
    } catch (err) {
      errHandle(res);
    }
  } else if (req.url === "/upload" && req.method === "POST") {
    const form = new formidable.IncomingForm();
    form.multiples = true;
    form.parse(req, async (err, fields, files) => {
      console.log("Fields:", fields); // 输出表单字段
      console.log("Files:", files); // 输出上传的文件详情

      if (err) {
        console.error(err);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal server error");
        return;
      }

      try {
        const base64 = await convertToBase64(files.image);

        // Use the client and collection
        const newImage = new Image({
          filename: files.image[0].originalFilename, // 存储原始文件名
          imageBase64: base64,
        });

        const result = await newImage.save(); // 保存到数据库
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "File uploaded and saved",
            id: result._id,
          })
        );
      } catch (error) {
        console.error(error);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Failed to save the image");
      }
    });
  } else if (req.method === "OPTIONS") {
    res.writeHead(200, headers);
    res.end();
  } else {
    res.writeHead(404, headers);
    res.write(
      JSON.stringify({
        status: "fail",
        message: "No such route",
      })
    );
    res.end();
  }
};

const server = http.createServer(requestListener);
server.listen(8080);

var http = require("http");
require("dotenv").config();
const mongoose = require("mongoose");
const formidable = require("formidable");
const path = require("path");
const { Storage } = require("@google-cloud/storage");

const storage = new Storage({
  keyFilename: path.join(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS),
  projectId: "dao-420504",
});
const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);

const fs = require("fs");

// storage.getBuckets().then((x) => console.log(x));
// MongoDB连接
mongoose.connect(process.env.MONGO_URI);

// Image Schema
const ImageSchema = new mongoose.Schema(
  {
    filename: String,
    url: String,
    category: String,
    gcsId: String,
    
  },
  { collection: "textureImages" }
);
const Image = mongoose.model("Image", ImageSchema);

const headers = {
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Content-Length, X-Requested-With",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, POST, GET, OPTIONS, DELETE",
  "Content-Type": "application/json",
};

const requestListener = async (req, res) => {
  if (req.url === "/images" && req.method === "GET") {
    const images = await Image.find();
    res.writeHead(200, headers);
    res.end(JSON.stringify({ status: "success", data: images }));
  } else if (req.url === "/upload" && req.method === "POST") {
    const form = new formidable.IncomingForm();
    form.parse(req, (err, fields, files) => {
      // console.log(files.image[0]);
      if (err) {
        console.error(err);
        res.writeHead(500, headers);
        res.end(JSON.stringify({ error: "Could not parse files." }));
        return;
      }
      if (!files.image[0]) {
        console.error("No image file uploaded.");
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("No image file uploaded.");
        return;
      }
      const file = files.image[0];
      const filePath = file.filepath;
      const originalFileName = file.originalFilename;
      const fileType = Array.isArray(fields.type) ? fields.type[0] : fields.type;
      const fileName = `${fileType}-${originalFileName}`;
      const blob = bucket.file(fileName);
      const blobStream = blob.createWriteStream({ resumable: false });

      blobStream.on("error", (err) => {
        console.error(err);
        res.writeHead(500, headers);
        res.end(JSON.stringify({ error: "Error writing to GCS." }));
      });

      blobStream.on("finish", async () => {
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;

        try {
          const newImage = new Image({
            filename: fileName,
            url: publicUrl,
            category: fileType,
            gcsId: blob.id,
          });
          await newImage.save();
          res.writeHead(200, headers);
          res.end(
            JSON.stringify({
              message: "File uploaded successfully",
              data: newImage,
            })
          );
        } catch (error) {
          console.error(error);
          res.writeHead(500, headers);
          res.end(JSON.stringify({ error: "Error saving to database." }));
        }
      });

      blobStream.end(fs.readFileSync(filePath));
    });
  } else if (req.method === "OPTIONS") {
    res.writeHead(200, headers);
    res.end();
  } else {
    res.writeHead(404, headers);
    res.end(JSON.stringify({ status: "fail", message: "No such route" }));
  }
};

const server = http.createServer(requestListener);
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

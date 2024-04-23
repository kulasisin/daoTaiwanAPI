const mongoose = require("mongoose");

const textureImageSchema = new mongoose.Schema(
  {
    filename: String,
    url: String,
    category: String,
    gcsId: String,
  },
  { collection: "textureImages" }
);

const texutureImage = mongoose.model("textureImage", textureImageSchema);

module.exports = texutureImage;

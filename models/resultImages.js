const mongoose = require("mongoose");
const ResultImageSchema = new mongoose.Schema(
  {
    originalId: String,
    filename: String,
    url: String,
    category: String,
    gcsId: String,
  },
  { collection: "resultImages" }
);
const resultImage = mongoose.model("ResultImage", ResultImageSchema);

module.exports = resultImage;

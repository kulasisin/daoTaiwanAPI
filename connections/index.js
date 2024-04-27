const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./.env" });

const productionDB = process.env.DATABASE.replace(
  "<password>",
  process.env.DATABASE_PASSWORD
);

const DB =
  process.env.NODE_ENV === "production"
    ? productionDB
    : process.env.DATABASE_LOCAL;

try {
  mongoose
    .connect(DB)
    .then(() => console.log("資料庫連線成功"));
} catch (error) {
  console.error("資料庫連線失敗:", error);
}

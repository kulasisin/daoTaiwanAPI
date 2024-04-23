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
    .then(() => console.log("Database connected successfully"));
} catch (error) {
  console.error("Failed to connect to database:", error);
}

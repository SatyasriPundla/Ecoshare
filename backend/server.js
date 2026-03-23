import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import donationRoutes from "./routes/donationRoutes.js";
import userRoutes from "./routes/userRoutes.js";

/* global process */

dotenv.config();

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/donations", donationRoutes);
app.use("/api/users", userRoutes);

const PORT = 5000;
const { MONGO_URI } = process.env;

if (!MONGO_URI) {
  // Fail fast on misconfiguration.
  console.error("Missing env var: MONGO_URI");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => {
      console.log(`API server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });


import express from "express";
import User from "../models/User.js";

const router = express.Router();

function userToResponse(doc) {
  if (!doc) return null;
  const obj = doc.toObject({ versionKey: false, virtuals: false });
  obj.id = String(doc._id);
  delete obj._id;
  return obj;
}

// POST /api/users → create user if not exists
router.post("/", async (req, res) => {
  try {
    const { uid, email, role } = req.body ?? {};

    if (!uid || !email || !role) {
      return res.status(400).json({ error: "Missing uid, email, or role" });
    }

    const existing = await User.findOne({ uid });
    if (existing) {
      console.log("User already exists:", uid);
      return res.json(userToResponse(existing));
    }

    const created = await User.create({ uid, email, role });
    console.log("User created:", uid);
    return res.status(201).json(userToResponse(created));
  } catch (err) {
    console.error("POST /api/users error:", err);
    return res.status(500).json({ error: err?.message ?? "Failed to create user" });
  }
});

export default router;


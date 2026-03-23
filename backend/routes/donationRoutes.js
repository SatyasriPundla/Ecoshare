import express from "express";
import Donation from "../models/Donation.js";

const router = express.Router();

function donationToResponse(doc) {
  if (!doc) return null;
  const obj = doc.toObject({ versionKey: false, virtuals: false });
  obj.id = String(doc._id);
  delete obj._id;
  return obj;
}

// POST /api/donations → create donation
router.post("/", async (req, res) => {
  try {
    const body = req.body ?? {};

    // Be tolerant to older frontend field names.
    const location = body.location ?? body.address ?? "";
    if (!location) {
      return res.status(400).json({ error: "Missing `location` (address) field" });
    }

    const donation = await Donation.create({
      type: body.type,
      quantity: body.quantity,
      location,
      condition: body.condition ?? null,
      phone: body.phone ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      destination_type: body.destination_type,
      status: body.status ?? "pending",
      userId: body.userId ?? null,
      donorName: body.donorName ?? null,
    });

    return res.status(201).json(donationToResponse(donation));
  } catch (err) {
    console.error("POST /api/donations error:", err);
    return res.status(500).json({ error: err?.message ?? "Failed to create donation" });
  }
});

// GET /api/donations → fetch all donations
router.get("/", async (req, res) => {
  try {
    const donations = await Donation.find().sort({ createdAt: -1 });
    return res.json(donations.map(donationToResponse));
  } catch (err) {
    console.error("GET /api/donations error:", err);
    return res.status(500).json({ error: err?.message ?? "Failed to fetch donations" });
  }
});

// PUT /api/donations/:id → update status (accept/complete)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body ?? {};

    let nextStatus = body.status;
    if (!nextStatus && body.action) {
      if (body.action === "accept") nextStatus = "accepted";
      if (body.action === "complete") nextStatus = "complete";
    }

    if (!nextStatus) {
      return res.status(400).json({ error: "Missing `status` (or `action`) in request body" });
    }

    const updated = await Donation.findByIdAndUpdate(
      id,
      { status: nextStatus },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Donation not found" });
    }

    return res.json(donationToResponse(updated));
  } catch (err) {
    console.error("PUT /api/donations/:id error:", err);
    return res.status(500).json({ error: err?.message ?? "Failed to update donation" });
  }
});

export default router;


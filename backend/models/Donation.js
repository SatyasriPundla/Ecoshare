import mongoose from "mongoose";

const DonationSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    quantity: { type: Number, required: true },

    // Existing frontend uses `address`; Mongo stores it as `location`.
    location: { type: String, required: true },

    condition: { type: String, default: null },
    phone: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },

    // Used by NGO/Compost dashboards for filtering.
    destination_type: {
      type: String,
      required: true,
      enum: ["ngo", "compost"],
    },

    status: {
      type: String,
      default: "pending",
      enum: ["pending", "accepted", "complete"],
    },

    userId: { type: String, default: null },
    donorName: { type: String, default: null },

    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model("Donation", DonationSchema);


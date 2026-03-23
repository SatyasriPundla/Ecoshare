import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    role: { type: String, required: true, enum: ["donor", "ngo", "compost"] },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model("User", UserSchema);


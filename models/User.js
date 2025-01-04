const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
    },
    username: String,
    firstName: String,
    lastName: String,
    role: {
      type: String,
      enum: ["student", "teacher"],
      default: "student",
    },
    teacherId: {
      type: Number,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);

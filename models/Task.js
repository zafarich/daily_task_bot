const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    teacherId: {
      type: Number,
      required: true,
      ref: "User",
    },
    title: {
      type: String,
      required: true,
    },
    description: String,
    shareLink: {
      type: String,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Task", taskSchema);

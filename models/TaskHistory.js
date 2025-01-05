const mongoose = require("mongoose");

const taskHistorySchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    studentId: {
      type: Number,
      ref: "User",
      required: true,
    },
    teacherId: {
      type: Number,
      ref: "User",
      required: true,
    },
    taskTitle: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: ["subscribed", "completed"],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("TaskHistory", taskHistorySchema);

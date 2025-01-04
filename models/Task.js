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
    subscribers: [
      {
        studentId: {
          type: Number,
          ref: "User",
        },
        status: {
          type: String,
          enum: ["pending", "completed"],
          default: "pending",
        },
        completedAt: Date,
      },
    ],
    remindersSent: {
      type: Number,
      default: 0,
    },
    lastReminderAt: Date,
    nextReminderAt: Date,
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

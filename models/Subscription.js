const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },
    subscribedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indekslar
subscriptionSchema.index({taskId: 1, studentId: 1}, {unique: true});

module.exports = mongoose.model("Subscription", subscriptionSchema);

const mongoose = require('mongoose');

const blockSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['text', 'checklist', 'chart', 'image', 'file'],
    required: true
  },
  content: { type: mongoose.Schema.Types.Mixed }, 
  fileUrl: { type: String, default: null }
});

const commentSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  senderName: { type: String, required: true },
  senderRole: { type: String, enum: ['Admin', 'Facility Administrator', 'Nurse', 'Guardian'], required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const dailyAssessmentSchema = new mongoose.Schema({
  residentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true },
  residentName: { type: String, required: true }, 
  authorId: { type: String, required: true }, 
  authorName: { type: String, required: true },
  title: { type: String, required: true, default: 'Daily Assessment Update' },
  date: { type: Date, default: Date.now },
  tags: [{ type: String }],
  blocks: [blockSchema], 
  comments: [commentSchema],
  reactions: {
    thumbsUp: { type: Number, default: 0 },
    heart: { type: Number, default: 0 },
    acknowledged: { type: Boolean, default: false }
  }
}, { timestamps: true });

module.exports = mongoose.model('DailyAssessment', dailyAssessmentSchema);
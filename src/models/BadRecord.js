const mongoose = require('mongoose');

const badRecordSchema = new mongoose.Schema({
  source: {
    type: String,
    enum: ['USER', 'EXCHANGE'],
    required: true
  },
  raw_data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  reason: {
    type: String,
    required: true
  }
}, { timestamps: true });

const BadRecord = mongoose.model('BadRecord', badRecordSchema);

module.exports = BadRecord;

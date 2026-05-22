const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['Matched', 'Conflicting', 'Unmatched (User only)', 'Unmatched (Exchange only)'],
    required: true
  },
  reason: {
    type: String,
    default: ''
  },
  user_transaction: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  exchange_transaction: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, { _id: false });

const reconciliationRunSchema = new mongoose.Schema({
  runId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  config: {
    TIMESTAMP_TOLERANCE_SECONDS: Number,
    QUANTITY_TOLERANCE_PCT: Number
  },
  results: [resultSchema],
  summary: {
    matched: { type: Number, default: 0 },
    conflicting: { type: Number, default: 0 },
    unmatched_user: { type: Number, default: 0 },
    unmatched_exchange: { type: Number, default: 0 }
  }
}, { timestamps: true });

const ReconciliationRun = mongoose.model('ReconciliationRun', reconciliationRunSchema);

module.exports = ReconciliationRun;

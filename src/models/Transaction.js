const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  source: {
    type: String,
    enum: ['USER', 'EXCHANGE'],
    required: true,
    index: true
  },
  transaction_id: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  asset: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  price_usd: {
    type: Number,
    default: null
  },
  fee: {
    type: Number,
    default: null
  },
  note: {
    type: String,
    default: ''
  },
  raw_data: {
    type: mongoose.Schema.Types.Mixed, 
    default: {}
  }
}, { timestamps: true });

// Compound index for quick lookup
transactionSchema.index({ source: 1, transaction_id: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;

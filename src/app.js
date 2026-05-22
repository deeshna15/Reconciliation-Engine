const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const reconciliationRoutes = require('./routes/reconciliation');

const app = express();

app.use(express.json());

// Routes
app.use('/api', reconciliationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!', details: err.message });
});

module.exports = app;

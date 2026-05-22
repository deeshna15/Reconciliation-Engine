const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { ingestData } = require('../services/ingestionService');
const { runMatchingEngine } = require('../services/matchingEngine');
const ReconciliationRun = require('../models/ReconciliationRun');
const path = require('path');

const router = express.Router();

router.post('/reconcile', async (req, res) => {
  try {
    const config = {
      TIMESTAMP_TOLERANCE_SECONDS: req.body.TIMESTAMP_TOLERANCE_SECONDS || parseInt(process.env.TIMESTAMP_TOLERANCE_SECONDS) || 300,
      QUANTITY_TOLERANCE_PCT: req.body.QUANTITY_TOLERANCE_PCT || parseFloat(process.env.QUANTITY_TOLERANCE_PCT) || 0.01
    };

    // Paths to the local CSV files
    const userCsvPath = path.join(__dirname, '../../user_transactions.csv');
    const exchangeCsvPath = path.join(__dirname, '../../exchange_transactions.csv');

    // 1. Ingest Data
    const ingestStats = await ingestData(userCsvPath, exchangeCsvPath);

    // 2. Run Matching Engine
    const results = await runMatchingEngine(config);

    // 3. Calculate Summary
    const summary = {
      matched: results.filter(r => r.status === 'Matched').length,
      conflicting: results.filter(r => r.status === 'Conflicting').length,
      unmatched_user: results.filter(r => r.status === 'Unmatched (User only)').length,
      unmatched_exchange: results.filter(r => r.status === 'Unmatched (Exchange only)').length
    };

    // 4. Save Run
    const runId = uuidv4();
    const run = new ReconciliationRun({
      runId,
      config,
      results,
      summary
    });
    await run.save();

    res.json({
      message: 'Reconciliation completed successfully',
      runId,
      ingestStats,
      summary
    });
  } catch (error) {
    console.error('Error during reconciliation:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

router.get('/report/:runId', async (req, res) => {
  try {
    const run = await ReconciliationRun.findOne({ runId: req.params.runId });
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    
    // For CSV download, we could use csv-writer, but let's just return JSON for the API as per standard REST, 
    // unless CSV download is explicitly requested. The requirements said: "Produce a report (again in CSV format)".
    // Let's support an optional ?format=csv query parameter.
    if (req.query.format === 'csv') {
      const { createObjectCsvStringifier } = require('csv-writer');
      const csvStringifier = createObjectCsvStringifier({
        header: [
          { id: 'status', title: 'STATUS' },
          { id: 'reason', title: 'REASON' },
          { id: 'user_transaction_id', title: 'USER_TX_ID' },
          { id: 'user_timestamp', title: 'USER_TIMESTAMP' },
          { id: 'user_type', title: 'USER_TYPE' },
          { id: 'user_asset', title: 'USER_ASSET' },
          { id: 'user_quantity', title: 'USER_QUANTITY' },
          { id: 'exchange_transaction_id', title: 'EXCHANGE_TX_ID' },
          { id: 'exchange_timestamp', title: 'EXCHANGE_TIMESTAMP' },
          { id: 'exchange_type', title: 'EXCHANGE_TYPE' },
          { id: 'exchange_asset', title: 'EXCHANGE_ASSET' },
          { id: 'exchange_quantity', title: 'EXCHANGE_QUANTITY' }
        ]
      });

      const records = run.results.map(r => ({
        status: r.status,
        reason: r.reason,
        user_transaction_id: r.user_transaction?.transaction_id || '',
        user_timestamp: r.user_transaction?.timestamp || '',
        user_type: r.user_transaction?.type || '',
        user_asset: r.user_transaction?.asset || '',
        user_quantity: r.user_transaction?.quantity || '',
        exchange_transaction_id: r.exchange_transaction?.transaction_id || '',
        exchange_timestamp: r.exchange_transaction?.timestamp || '',
        exchange_type: r.exchange_transaction?.type || '',
        exchange_asset: r.exchange_transaction?.asset || '',
        exchange_quantity: r.exchange_transaction?.quantity || ''
      }));

      const header = csvStringifier.getHeaderString();
      const rows = csvStringifier.stringifyRecords(records);
      
      res.header('Content-Type', 'text/csv');
      res.attachment(`reconciliation_report_${req.params.runId}.csv`);
      return res.send(header + rows);
    }

    res.json(run.results);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/report/:runId/summary', async (req, res) => {
  try {
    const run = await ReconciliationRun.findOne({ runId: req.params.runId });
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    res.json(run.summary);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/report/:runId/unmatched', async (req, res) => {
  try {
    const run = await ReconciliationRun.findOne({ runId: req.params.runId });
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    const unmatched = run.results.filter(r => r.status.startsWith('Unmatched'));
    res.json(unmatched);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

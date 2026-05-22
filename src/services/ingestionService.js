const fs = require('fs');
const csv = require('csv-parser');
const Transaction = require('../models/Transaction');
const BadRecord = require('../models/BadRecord');

async function parseCSV(filePath, source) {
  const results = [];
  const badRecords = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        // Skip empty rows
        if (!data.transaction_id && !data.timestamp && !data.type && !data.asset) return;

        let reason = null;

        // Validation
        const qty = parseFloat(data.quantity);
        if (isNaN(qty)) {
          reason = 'Invalid or missing quantity';
        } else if (qty < 0) {
          reason = 'Negative quantity';
        }

        const timestamp = new Date(data.timestamp);
        if (isNaN(timestamp.getTime())) {
          reason = 'Invalid or missing timestamp';
        }

        if (reason) {
          badRecords.push({
            source,
            raw_data: data,
            reason
          });
        } else {
          results.push({
            source,
            transaction_id: data.transaction_id,
            timestamp: timestamp,
            type: data.type.toUpperCase(),
            asset: data.asset, // We will standardize asset later in matching engine or here. Let's keep it as is.
            quantity: qty,
            price_usd: parseFloat(data.price_usd) || null,
            fee: parseFloat(data.fee) || null,
            note: data.note || '',
            raw_data: data
          });
        }
      })
      .on('end', async () => {
        resolve({ results, badRecords });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

async function ingestData(userCsvPath, exchangeCsvPath) {
  // Clear existing data for a fresh run
  await Transaction.deleteMany({});
  await BadRecord.deleteMany({});

  const userParsed = await parseCSV(userCsvPath, 'USER');
  const exchangeParsed = await parseCSV(exchangeCsvPath, 'EXCHANGE');

  // Bulk insert valid transactions
  if (userParsed.results.length > 0) {
    await Transaction.insertMany(userParsed.results);
  }
  if (exchangeParsed.results.length > 0) {
    await Transaction.insertMany(exchangeParsed.results);
  }

  // Bulk insert bad records
  const allBadRecords = [...userParsed.badRecords, ...exchangeParsed.badRecords];
  if (allBadRecords.length > 0) {
    await BadRecord.insertMany(allBadRecords);
  }

  return {
    userValid: userParsed.results.length,
    userInvalid: userParsed.badRecords.length,
    exchangeValid: exchangeParsed.results.length,
    exchangeInvalid: exchangeParsed.badRecords.length
  };
}

module.exports = {
  ingestData
};

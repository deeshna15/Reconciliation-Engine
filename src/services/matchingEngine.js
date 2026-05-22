const Transaction = require('../models/Transaction');

const ASSET_ALIASES = {
  'BITCOIN': 'BTC',
  'ETHEREUM': 'ETH',
  'TETHER': 'USDT',
  'SOLANA': 'SOL',
  'POLYGON': 'MATIC',
  'CHAINLINK': 'LINK'
};

function standardizeAsset(asset) {
  if (!asset) return '';
  const upperAsset = asset.toUpperCase();
  return ASSET_ALIASES[upperAsset] || upperAsset;
}

function getTypeEquivalents(source, type) {
  // If User has TRANSFER_OUT, Exchange should have TRANSFER_IN
  if (source === 'USER') {
    if (type === 'TRANSFER_OUT') return ['TRANSFER_IN', 'TRANSFER_OUT']; // Sometimes exact matches occur?
    if (type === 'TRANSFER_IN') return ['TRANSFER_OUT', 'TRANSFER_IN'];
  } else {
    if (type === 'TRANSFER_OUT') return ['TRANSFER_IN', 'TRANSFER_OUT'];
    if (type === 'TRANSFER_IN') return ['TRANSFER_OUT', 'TRANSFER_IN'];
  }
  return [type]; // BUY matches BUY, SELL matches SELL
}

async function runMatchingEngine(config) {
  const { TIMESTAMP_TOLERANCE_SECONDS, QUANTITY_TOLERANCE_PCT } = config;
  const timeTolMs = TIMESTAMP_TOLERANCE_SECONDS * 1000;

  // Fetch all valid transactions
  const userTxns = await Transaction.find({ source: 'USER' }).lean();
  const exchangeTxns = await Transaction.find({ source: 'EXCHANGE' }).lean();

  const results = [];
  const matchedExchangeIds = new Set();

  for (const userTx of userTxns) {
    const userAsset = standardizeAsset(userTx.asset);
    const expectedExchangeTypes = getTypeEquivalents('USER', userTx.type);
    
    // Find potential matches based on time, type, and asset
    let bestMatch = null;
    let isConflicting = false;
    let conflictReason = '';

    for (const exTx of exchangeTxns) {
      if (matchedExchangeIds.has(exTx._id.toString())) continue;

      const exAsset = standardizeAsset(exTx.asset);
      if (userAsset !== exAsset) continue;
      if (!expectedExchangeTypes.includes(exTx.type)) continue;

      const timeDiff = Math.abs(new Date(userTx.timestamp).getTime() - new Date(exTx.timestamp).getTime());
      
      // If within time tolerance
      if (timeDiff <= timeTolMs) {
        // Check quantity tolerance
        const qtyDiff = Math.abs(userTx.quantity - exTx.quantity);
        // PCT is out of 1, e.g., 0.01 means 1% or 0.01% depending on interpretation. 
        // We assume 0.01 = 0.01% as per instructions. "e.g. 0.01% by default". 
        // If config is 0.01, it means 0.0001 in multiplier.
        // Let's treat config as percentage value: 0.01 means 0.01%
        const maxAllowedDiff = userTx.quantity * (QUANTITY_TOLERANCE_PCT / 100);

        if (qtyDiff <= maxAllowedDiff) {
          bestMatch = exTx;
          isConflicting = false;
          break; // Found perfect match
        } else {
          // If we find one in time but wrong qty, it's conflicting, unless we find a perfect match later
          bestMatch = exTx;
          isConflicting = true;
          conflictReason = `Matched by time and type, but quantity difference (${qtyDiff}) exceeds tolerance (${maxAllowedDiff})`;
        }
      }
    }

    if (bestMatch && !isConflicting) {
      matchedExchangeIds.add(bestMatch._id.toString());
      results.push({
        status: 'Matched',
        reason: 'Matched within tolerances',
        user_transaction: userTx.raw_data,
        exchange_transaction: bestMatch.raw_data
      });
    } else if (bestMatch && isConflicting) {
      matchedExchangeIds.add(bestMatch._id.toString());
      results.push({
        status: 'Conflicting',
        reason: conflictReason,
        user_transaction: userTx.raw_data,
        exchange_transaction: bestMatch.raw_data
      });
    } else {
      results.push({
        status: 'Unmatched (User only)',
        reason: 'No corresponding exchange transaction found within time window',
        user_transaction: userTx.raw_data,
        exchange_transaction: null
      });
    }
  }

  // Find remaining exchange transactions
  for (const exTx of exchangeTxns) {
    if (!matchedExchangeIds.has(exTx._id.toString())) {
      results.push({
        status: 'Unmatched (Exchange only)',
        reason: 'No corresponding user transaction found',
        user_transaction: null,
        exchange_transaction: exTx.raw_data
      });
    }
  }

  return results;
}

module.exports = {
  runMatchingEngine
};

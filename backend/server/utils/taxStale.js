// Helpers for marking TaxRecommendation documents stale.
// TaxRecommendation is required lazily to avoid circular model dependencies.

async function markStaleByForm16(form16Id) {
  if (!form16Id) return;
  const TaxRecommendation = require('../models/taxrecommendation.model');
  await TaxRecommendation.updateMany({ form16Id }, { $set: { isStale: true } });
}

async function markStaleByUser(userId) {
  if (!userId) return;
  const TaxRecommendation = require('../models/taxrecommendation.model');
  await TaxRecommendation.updateMany({ userId }, { $set: { isStale: true } });
}

// Register post hooks on the Form16 model.
function hookStaleByForm16(schema) {
  schema.post('save', async function (doc) {
    if (doc.isNew) return; // brand-new record has no recommendation yet
    await markStaleByForm16(doc._id);
  });
  schema.post('findOneAndUpdate', async function (doc) {
    if (doc && doc._id) await markStaleByForm16(doc._id);
  });
}

// Register post hooks on Investment / Insurance / EMILoan / EducationPayment.
function hookStaleByUser(schema) {
  schema.post('save', async function (doc) {
    await markStaleByUser(doc.memberId || doc.userId);
  });
  schema.post('findOneAndUpdate', async function (doc) {
    if (doc) await markStaleByUser(doc.memberId || doc.userId);
  });
}

module.exports = {
  markStaleByForm16,
  markStaleByUser,
  hookStaleByForm16,
  hookStaleByUser,
};

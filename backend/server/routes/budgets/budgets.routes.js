const express = require('express');
const Joi = require('joi');
const Budget = require('../../models/budget.model');
const Transaction = require('../../models/transaction.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');

const router = express.Router();
router.use(isAuthenticated);

function budgetInterval(period, now = new Date()) {
  if (period === 'YEARLY') return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) };
  if (period === 'WEEKLY') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
    const to = new Date(from); to.setDate(to.getDate() + 7);
    return { from, to };
  }
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
}

function requireFamily(req,res){ if(!req.user.familyAccountId){ res.status(400).json({ error:'Join or create a family first'}); return false } return true }

router.get('/', async (req,res,next)=>{
  try{
    if(!requireFamily(req,res)) return;
    const items = await Budget.find({ familyId: req.user.familyAccountId }).sort({ createdAt:-1 });
    // compute spent for current period — PRIVATE is invisible to others even in aggregates
    const now = new Date();
    for(const b of items){
      const { from, to } = budgetInterval(b.period, now);
      const filter={ familyId: req.user.familyAccountId, status:{$ne:'VOIDED'}, type: { $in:['EXPENSE','CASH_EXPENSE'] }, occurredAt:{ $gte: from, $lt: to }, $or: [{ visibility: { $ne: 'PRIVATE' } }, { createdBy: req.user._id }] };
      if(b.scope==='CATEGORY' && b.category) filter.category=b.category;
      if(b.scope==='MEMBER' && b.memberId) filter.createdBy=b.memberId;
      // for MEMBER scope, if filtering other member's budget, respect their PRIVATE? already via $or above
      const txs = await Transaction.find(filter).lean();
      // if MEMBER scope and viewer is not that member and not admin, hide other's PRIVATE already filtered; for FAMILY scope, private of others excluded via $or
      b.spentPaise = txs.reduce((s,t)=> s+(t.amountPaise||0),0);
    }
    res.json({ items });
  } catch(err){ next(err) }
});

router.post('/', async (req,res,next)=>{
  try{
    if(!requireFamily(req,res)) return;
    const schema = Joi.object({ scope: Joi.string().valid('FAMILY','CATEGORY','MEMBER').required(), category: Joi.string().allow('',null), memberId: Joi.string().allow('',null), period: Joi.string().valid('MONTHLY','WEEKLY','YEARLY').default('MONTHLY'), amountPaise: Joi.number().integer().min(1).required() });
    const { error, value } = schema.validate(req.body);
    if(error) return res.status(400).json({ error:'Validation failed', details:error.details.map(d=>d.message) });
    const periodKey = new Date().toISOString().slice(0,7);
    const doc = await Budget.create({ familyId: req.user.familyAccountId, ...value, periodKey });
    res.status(201).json({ budget: doc });
  } catch(err){ next(err) }
});

router.delete('/:id', async (req,res,next)=>{
  try{
    const b = await Budget.findById(req.params.id);
    if(!b) return res.status(404).json({ error:'Not found'});
    if(String(b.familyId)!==String(req.user.familyAccountId)) return res.status(403).json({ error:'Forbidden'});
    await b.deleteOne();
    res.json({ ok:true });
  } catch(err){ next(err) }
});

module.exports = router;

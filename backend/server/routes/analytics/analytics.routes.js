const express = require('express');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { getFamilyAnalytics } = require('../../services/familyAnalytics.service');
const router = express.Router();
router.use(isAuthenticated);
function requireFamily(req,res){ if(!req.user.familyAccountId){ res.status(400).json({ error:'Join or create a family first'}); return false } return true }
router.get('/family', async (req,res,next)=>{
  try{
    if(!requireFamily(req,res)) return;
    const from = req.query.from || undefined;
    const to = req.query.to || undefined;
    const memberIds = req.query.members ? String(req.query.members).split(',').filter(Boolean) : undefined;
    const categories = req.query.categories ? String(req.query.categories).split(',').filter(Boolean) : undefined;
    const modes = req.query.modes ? String(req.query.modes).split(',').filter(Boolean) : undefined;
    if(from && to){
      const diff = (new Date(to)-new Date(from))/86400000;
      if(diff>365) return res.status(400).json({ error:'Range too large (max 365 days)' });
      if(diff<0) return res.status(400).json({ error:'Invalid range' });
    }
    const data = await getFamilyAnalytics({ familyId: req.user.familyAccountId, from, to, memberIds, categories, modes });
    res.json(data);
  } catch(err){ next(err) }
});
module.exports = router;

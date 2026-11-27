const express=require('express'),rateLimit=require('express-rate-limit');
const router=express.Router();router.use(rateLimit({windowMs:60000,max:30}));
const {PACKS}=require('../services/payments/processingTopupCatalog');
const runtime=require('../services/processingTokens/runtime');
const service=()=>require('../services/payments/processingTopups').production();
router.get('/catalog',async(_req,res)=>{
  let available=false;try{available=runtime.enabled()&&process.env.PLUS_PURCHASES_ENABLED==='true'&&(await runtime.service().purchaseCapacity(1100000)).available;}catch{}
  res.json({packs:Object.values(PACKS),available,nonExpiring:true});
});
router.use(require('../authMiddleware'));
router.use((req,res,next)=>req.user?.claims?.email_verified===true?next():res.status(403).json({error:'VERIFIED_ACCOUNT_REQUIRED'}));
router.post('/create',async(req,res)=>{
  try{
    if(!runtime.enabled()||process.env.PLUS_PURCHASES_ENABLED!=='true')return res.status(503).json({error:'PURCHASES_UNAVAILABLE'});
    res.json(await service().create(req.userId||req.user.uid,req.body.packageId));
  }catch(error){res.status(error.status||503).json({error:error.code||'TOPUP_CHECKOUT_UNAVAILABLE'});}
});
router.post('/capture',async(req,res)=>{
  try{res.json(await service().capture(req.userId||req.user.uid,req.body.orderId));}
  catch(error){res.status(error.status||503).json({error:error.code||'TOPUP_PAYMENT_RECONCILIATION_REQUIRED'});}
});
module.exports=router;

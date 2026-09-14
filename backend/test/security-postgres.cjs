// Run only against a disposable, migrated PostgreSQL database. No external provider calls.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const url = new URL(process.env.AUDIT_DATABASE_URL || 'http://invalid');
assert(['127.0.0.1','localhost'].includes(url.hostname) && url.pathname === '/rip_audit_backend', 'AUDIT_DATABASE_URL must target the disposable local rip_audit_backend database');
process.env.DATABASE_URL = url.href;
process.env.NODE_ENV = 'test'; process.env.JEST_WORKER_ID = 'postgres-regressions';
Object.assign(process.env,{PAYMENT_PROVIDER:'crypto_tron',MIN_WITHDRAW_MINOR:'100',WITHDRAW_FEE_MINOR:'0',WITHDRAW_REQUIRE_STEAM_LINKED:'false',WITHDRAW_MIN_COMPLETED_SALES:'0',WITHDRAW_MANUAL_REVIEW:'true',WITHDRAW_MANUAL_REVIEW_COUNT:'999',WITHDRAW_DAILY_CAP_MINOR:'1000',MIN_DEPOSIT_MINOR:'100'});
require('reflect-metadata');
const {PrismaService} = require('../dist/src/prisma/prisma.service');
const {LedgerService} = require('../dist/src/wallet/ledger.service');
const {PaymentsService} = require('../dist/src/payments/payments.service');
const {WithdrawalGuardService} = require('../dist/src/payments/withdrawal-guard.service');
const {BuyRequestsService} = require('../dist/src/buy-requests/buy-requests.service');
const {BuyRequestMatchingService} = require('../dist/src/buy-requests/buy-request-matching.service');
const {ExtensionTradeTaskService} = require('../dist/src/extension/extension-trade-task.service');
const {AuthService} = require('../dist/src/auth/auth.service');
const {JwtStrategy} = require('../dist/src/auth/jwt.strategy');
const db = new PrismaService(), ledger = new LedgerService(db);
const address='T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const passed=[];
async function check(name, fn) { await fn(); passed.push(name); console.log('PASS',name); }
async function user(amount=10000n) {const u=await db.user.create({data:{username:`audit-${randomUUID()}`,role:'BUYER'}});await ledger.deposit({userId:u.id,amountMinor:amount,idempotencyKey:randomUUID()});return u;}
async function fixture(buyer, price=900n) {
 const seller=await user();const item=await db.itemDefinition.create({data:{marketHashName:`audit-${randomUUID()}`}});
 const asset=await db.inventoryAsset.create({data:{ownerId:seller.id,itemDefinitionId:item.id,assetExternalId:randomUUID()}});
 const lot=await db.lot.create({data:{sellerId:seller.id,inventoryAssetId:asset.id,status:'ACTIVE',priceMinor:price,commissionMinor:0n,sellerReceiveMinor:price}});
 const order=await db.order.create({data:{buyerId:buyer.id,sellerId:seller.id,lotId:lot.id,status:'WAITING_TRADE',amountMinor:price,holdAmountMinor:price}});
 const wallet=await ledger.ensureUserWallet(buyer.id);const hold=await db.hold.create({data:{orderId:order.id,walletId:wallet.id,amountMinor:price}});
 const op=await db.tradeOperation.create({data:{orderId:order.id}});return {seller,item,asset,lot,order,hold,op};
}
(async()=>{
 await check('concurrent debits cannot overdraw a wallet',async()=>{const u=await user();const outcomes=await Promise.allSettled([1,2].map(i=>ledger.withdraw({userId:u.id,amountMinor:8000n,feeMinor:100n,netMinor:7900n,idempotencyKey:`w-${i}`,withdrawalRequestId:randomUUID()})));assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(await ledger.getAvailableBalance(u.id),2000n);});
 await check('database rejects negative account balances even outside LedgerService',async()=>{const u=await user();const wallet=await ledger.ensureUserWallet(u.id);await assert.rejects(db.walletAccount.update({where:{walletId_type:{walletId:wallet.id,type:'AVAILABLE'}},data:{balanceMinor:-1n}}));});
 await check('simultaneous cancellation and expiry release only their own reserve once',async()=>{const u=await user();const f=await fixture(u);const requests=[];for(const amount of [1000n,2000n]){const r=await db.buyRequest.create({data:{buyerId:u.id,itemDefinitionId:f.item.id,maxPriceMinor:amount,quantity:1,reservedAmountMinor:amount}});await ledger.reserveBuyRequestHold({buyerUserId:u.id,buyRequestId:r.id,amountMinor:amount,idempotencyKey:`reserve:${r.id}`});requests.push(r);}
 const service=new BuyRequestsService(db,{},ledger);await Promise.allSettled([service.cancel(u.id,requests[0].id),service.releaseHoldForExpired(requests[0].id)]);assert.equal(await ledger.getAvailableBalance(u.id),8000n);assert.equal((await db.buyRequest.findUnique({where:{id:requests[1].id}})).reservedAmountMinor,2000n);});
 await check('buy-request budget funds purchase without a second deposit and rolls back atomically',async()=>{const u=await user(1000n),f=await fixture(u);const r=await db.buyRequest.create({data:{buyerId:u.id,itemDefinitionId:f.item.id,maxPriceMinor:1000n,quantity:1,reservedAmountMinor:1000n}});await ledger.reserveBuyRequestHold({buyerUserId:u.id,buyRequestId:r.id,amountMinor:1000n,idempotencyKey:randomUUID()});const matching=new BuyRequestMatchingService(db,{},ledger);
 const transfer=async tx=>{await matching.fulfillForPurchase(u.id,f.item.id,900n,tx);await ledger.reservePurchaseHold({buyerUserId:u.id,orderId:f.order.id,holdId:f.hold.id,amountMinor:900n,idempotencyKey:'order-fund',tx});};
 await assert.rejects(db.$transaction(async tx=>{await transfer(tx);throw Error('crash');}));assert.equal(await ledger.getAvailableBalance(u.id),0n);assert.equal((await db.buyRequest.findUnique({where:{id:r.id}})).quantityFilled,0);await db.$transaction(transfer);assert.equal(await ledger.getAvailableBalance(u.id),100n);assert.equal((await db.buyRequest.findUnique({where:{id:r.id}})).quantityFilled,1);});
 await check('daily withdrawal quota is serialized on PostgreSQL',async()=>{const u=await user();const service=new PaymentsService(db,ledger,new WithdrawalGuardService(db),{});const outcomes=await Promise.allSettled([1,2].map(()=>service.createWithdrawal({userId:u.id,toAddress:address,amountMinor:800,idempotencyKey:randomUUID()})));assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(await db.withdrawalRequest.count({where:{userId:u.id}}),1);assert.equal(await ledger.getAvailableBalance(u.id),9200n);});
 await check('lost gateway response keeps the debit; late contradictory failed event cannot refund paid funds',async()=>{const u=await user();process.env.WITHDRAW_MANUAL_REVIEW='false';const service=new PaymentsService(db,ledger,new WithdrawalGuardService(db),{createGatewayWithdrawal:async()=>{throw Error('response lost');}});await assert.rejects(service.createWithdrawal({userId:u.id,toAddress:address,amountMinor:800,idempotencyKey:randomUUID()}));const row=await db.withdrawalRequest.findFirst({where:{userId:u.id}});assert.equal(row.status,'PROCESSING');assert.equal(await ledger.getAvailableBalance(u.id),9200n);
 await service.handleWebhook('',{eventId:randomUUID(),type:'withdrawal.paid',externalUserId:u.id,withdrawalId:'gw',externalId:`wd_${row.id}`,payoutTxHash:'tx',amountSun:'8000000'});await service.handleWebhook('',{eventId:randomUUID(),type:'withdrawal.failed',externalUserId:u.id,withdrawalId:'gw',externalId:`wd_${row.id}`,reason:'late contradictory event'});assert.equal((await db.withdrawalRequest.findUnique({where:{id:row.id}})).status,'PAID');assert.equal(await ledger.getAvailableBalance(u.id),9200n);process.env.WITHDRAW_MANUAL_REVIEW='true';});
 await check('failed webhook transaction retries and credits exactly once',async()=>{const u=await user();let crash=true;const fault=Object.create(ledger);fault.deposit=async p=>{const result=await ledger.deposit(p);if(crash)throw Error('crash after ledger insertion');return result;};const service=new PaymentsService(db,fault,new WithdrawalGuardService(db),{});const payload={eventId:randomUUID(),type:'deposit.credited',externalUserId:u.id,txHash:randomUUID(),amountSun:'10000000',address};await assert.rejects(service.handleWebhook('',payload));assert.equal(await ledger.getAvailableBalance(u.id),10000n);assert.equal((await db.paymentEvent.findUnique({where:{providerEventId:payload.eventId}})).processedAt,null);crash=false;await service.handleWebhook('',payload);await service.handleWebhook('',payload);assert.equal(await ledger.getAvailableBalance(u.id),11000n);assert.equal(await db.outboxEvent.count({where:{eventType:'DEPOSIT_COMPLETED',aggregateId:(await ledger.ensureUserWallet(u.id)).id}}),1);});
 await check('two devices cannot execute the same task; post-submit failure cannot be requeued; late evidence survives TTL',async()=>{const buyer=await user(),f=await fixture(buyer);const sessions=[];for(const deviceId of ['A','B']){await db.extensionDevice.create({data:{userId:f.seller.id,deviceId,publicKey:'test'}});sessions.push(await db.extensionSession.create({data:{userId:f.seller.id,deviceId,tokenJti:randomUUID(),expiresAt:new Date(Date.now()+3600000)}}));}
 const task=await db.tradeTask.create({data:{orderId:f.order.id,tradeOperationId:f.op.id,type:'create_offer',dedupKey:randomUUID(),idempotencyKey:randomUUID(),payload:{},expiresAt:new Date(Date.now()+3600000)}});
 const service=new ExtensionTradeTaskService(db,{reconcile:async p=>db.tradeOperation.update({where:{orderId:p.orderId},data:{externalOfferId:p.offerId}})},{},{recordTaskOutcome:async()=>{}},{recordTaskFailure:async()=>{}},{assertOfferSentTrustGate:async()=>{},acknowledge:async()=>{}},{pollOrderById:async()=>false});
 const results=await Promise.all(sessions.map(s=>service.pollTasks(s.id,5)));assert.equal(results.flat().length,1);const owner=sessions[results[0].length?0:1], leased=results.flat()[0];
 await assert.rejects(service.assertTaskOwner(task.id,'unknown-session'));
 for (const phase of ['ACKED','TRADE_PAGE_OPENED','OFFER_DRAFTED','ITEM_SELECTED']) await service.reportTaskProgress({taskId:task.id,sessionId:owner.id,leaseVersion:leased.leaseVersion,phase,idempotencyKey:phase});
 await service.reportTaskProgress({taskId:task.id,sessionId:owner.id,leaseVersion:leased.leaseVersion,phase:'OFFER_SUBMITTED',idempotencyKey:'submit'});
 await service.reportTaskProgress({taskId:task.id,sessionId:owner.id,leaseVersion:leased.leaseVersion,phase:'OFFER_FAILED',idempotencyKey:'fail',reasonCode:'OFFER_SEND_FAILED'});
 await service.reopenFailedRetryableTasksForWaitingOrders();assert.equal((await db.tradeTask.findUnique({where:{id:task.id}})).status,'FAILED');
 await db.tradeTask.update({where:{id:task.id},data:{status:'EXPIRED'}});
 await service.reportTaskProgress({taskId:task.id,sessionId:owner.id,leaseVersion:leased.leaseVersion,phase:'OFFER_SENT',idempotencyKey:'late',offerId:'123456789'});
 assert.equal((await db.tradeOperation.findUnique({where:{id:f.op.id}})).externalOfferId,'123456789');});
 await check('link tokens cannot authenticate API requests and login exchange is single-use',async()=>{const u=await user();const auth=new AuthService({signAsync:async()=> 'access-test'},db,{getById:async()=>u},{},{},{type:'steam'});const redirect=await auth.buildFrontendCallbackUrl({accessToken:'must-not-appear',user:{id:u.id}});assert(!redirect.includes('must-not-appear'));const code=new URL(redirect).searchParams.get('code');const results=await Promise.allSettled([auth.exchangeCode(code),auth.exchangeCode(code)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const jwt=new JwtStrategy({resolveSessionUser:async()=>({sub:u.id})});await assert.rejects(jwt.validate({sub:u.id,purpose:'steam_link'}));});

 await check('stale order transition cannot overwrite a completed concurrent transition',async()=>{
   const f=await fixture(await user()); const {OrderStateService}=require('../dist/src/orders/order-state.service');const states=new OrderStateService();
   const results=await Promise.allSettled(['FAILED','DISPUTE'].map(to=>db.$transaction(tx=>states.transition(tx,{orderId:f.order.id,from:'WAITING_TRADE',to}))));
   assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
   assert.equal(await db.orderStatusEvent.count({where:{orderId:f.order.id}}),1);
 });
 await check('buyer cannot refund an order after Steam sending begins',async()=>{
   const buyer=await user(),f=await fixture(buyer);const {OrdersService}=require('../dist/src/orders/orders.service');const {OrderStateService}=require('../dist/src/orders/order-state.service');
   await db.tradeTask.create({data:{orderId:f.order.id,tradeOperationId:f.op.id,type:'create_offer',dedupKey:randomUUID(),idempotencyKey:randomUUID(),payload:{},status:'FAILED',sendStartedAt:new Date(),expiresAt:new Date(Date.now()+60000)}});
   await assert.rejects(OrdersService.prototype.cancel.call({prisma:db,orderStateService:new OrderStateService(),ledgerService:ledger},buyer.id,f.order.id,randomUUID()),/Trade sending has started/);
   assert.equal((await db.order.findUnique({where:{id:f.order.id}})).status,'WAITING_TRADE');
   assert.equal(await ledger.getAvailableBalance(buyer.id),10000n);
 });
 await check('canceled order cannot authorize a Steam POST from an already leased task',async()=>{
   const f=await fixture(await user());await db.order.update({where:{id:f.order.id},data:{status:'CANCELED'}});
   const task=await db.tradeTask.create({data:{orderId:f.order.id,tradeOperationId:f.op.id,type:'create_offer',dedupKey:randomUUID(),idempotencyKey:randomUUID(),payload:{},status:'DISPATCHED',executionPhase:'ITEM_SELECTED',expiresAt:new Date(Date.now()+60000)}});
   const service=new ExtensionTradeTaskService(db,{},{},{},{},{},{});
   await assert.rejects(service.reportTaskProgress({taskId:task.id,phase:'OFFER_SUBMITTED',idempotencyKey:randomUUID()}),/Order no longer accepts/);
   assert.equal((await db.tradeTask.findUnique({where:{id:task.id}})).sendStartedAt,null);
 });
 await check('expiry sweep cannot overwrite an OFFER_SENT arriving after its snapshot',async()=>{
   const f=await fixture(await user());const task=await db.tradeTask.create({data:{orderId:f.order.id,tradeOperationId:f.op.id,type:'create_offer',dedupKey:randomUUID(),idempotencyKey:randomUUID(),payload:{},status:'DISPATCHED',executionPhase:'OFFER_SUBMITTED',sendStartedAt:new Date(),expiresAt:new Date(Date.now()-1000)}});
   const wrapped={};wrapped.tradeTask={findMany:async()=>{const snapshot=await db.tradeTask.findUnique({where:{id:task.id}});await db.tradeTask.update({where:{id:task.id},data:{status:'ACKED',executionPhase:'OFFER_SENT'}});return [snapshot];}};
   wrapped.$transaction=db.$transaction.bind(db);
   const service=new ExtensionTradeTaskService(wrapped,{},{},{},{},{},{});
   assert.equal(await service.expireTasks(),0);assert.equal((await db.tradeTask.findUnique({where:{id:task.id}})).status,'ACKED');
   assert.equal(await db.outboxEvent.count({where:{aggregateId:task.id,eventType:'TRADE_TASK_EXPIRED'}}),0);
 });
 await check('two offer references cannot replace one another after the same empty snapshot',async()=>{
   const f=await fixture(await user());const {TradeReferenceReconcileService}=require('../dist/src/trades/trade-reference-reconcile.service');
   const snapshot=await db.order.findUnique({where:{id:f.order.id},include:{tradeOperation:true,lot:true}});
   const wrapped={auditLog:db.auditLog,tradeOperation:db.tradeOperation,outboxEvent:db.outboxEvent,$transaction:db.$transaction.bind(db)};wrapped.order={findUnique:async()=>snapshot};
   const service=new TradeReferenceReconcileService(wrapped,{}, {},{pollOrderById:async()=>false});
   const refs=['98765432101','98765432102'];
   const results=await Promise.allSettled(refs.map(offerId=>service.reconcile({orderId:f.order.id,sellerId:f.seller.id,offerId,source:'EXTENSION',idempotencyKey:randomUUID()})));
   assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
   assert(refs.includes((await db.tradeOperation.findUnique({where:{id:f.op.id}})).externalOfferId));
 });

 for (const extensionFirst of ['false','true']) await check(`unknown Steam response waits until buyer receipt; receipt completes exactly once (extensionFirst=${extensionFirst})`,async()=>{
   process.env.ENABLE_EXTENSION_FIRST_TRADE_FLOW=extensionFirst;
   process.env.ENABLE_DELIVERY_VERIFICATION_ENGINE='true';process.env.ENABLE_REAL_SETTLEMENT='false';
   const buyer=await user(),f=await fixture(buyer),offerId=extensionFirst==='true'?'936147974901':'936147974900';
   await db.lot.update({where:{id:f.lot.id},data:{status:'RESERVED'}});
   await db.inventoryAsset.update({where:{id:f.asset.id},data:{status:'RESERVED'}});
   await ledger.reservePurchaseHold({buyerUserId:buyer.id,orderId:f.order.id,holdId:f.hold.id,amountMinor:900n,idempotencyKey:randomUUID()});
   await db.tradeOperation.update({where:{id:f.op.id},data:{externalOfferId:offerId,verificationMode:'STEAM_POLL'}});
   const {TradesService}=require('../dist/src/trades/trades.service');
   const {OrderStateService}=require('../dist/src/orders/order-state.service');
   const {LotStateService}=require('../dist/src/lots/lot-state.service');
   const {TradeOperationStateService}=require('../dist/src/trades/trade-operation-state.service');
   const {SettlementService}=require('../dist/src/settlement/settlement.service');
   const {DeliveryVerificationEngineService}=require('../dist/src/trades/delivery-verification-engine.service');
   const {TradeStatusPollerService}=require('../dist/src/trades/trade-status-poller.service');
   const {ExtensionTradeAckService}=require('../dist/src/extension/extension-trade-ack.service');
   const states=new OrderStateService(),metrics={recordOrderCompleted:()=>{},recordVerifyMismatch:()=>{}};
   const trades=Object.create(TradesService.prototype);
   Object.assign(trades,{prisma:db,orderStateService:states,tradeOperationStateService:new TradeOperationStateService(),extensionFlowMetrics:metrics,settlementService:new SettlementService(db,ledger,new LotStateService(),states,{}),verifyOffer:async()=>({status:'unknown',tradable:null,tradeLockUntil:null})});
   const engine=new DeliveryVerificationEngineService(db,trades,{verify:async()=> 'unknown'});
   const poller=new TradeStatusPollerService(db,trades,engine,{},metrics);
   await poller.pollOrderById(f.order.id,{force:true});
   assert.equal((await db.order.findUnique({where:{id:f.order.id}})).status,'WAITING_TRADE');
   assert.equal(await ledger.getAvailableBalance(f.seller.id),10000n);
   const ack=new ExtensionTradeAckService(db,poller);
   const params={userId:buyer.id,orderId:f.order.id,type:'BUYER_ACK_RECEIVED',offerId,idempotencyKey:randomUUID(),requireChannelEnabled:false};
   await ack.acknowledge(params);
   assert.equal((await db.order.findUnique({where:{id:f.order.id}})).status,'COMPLETED');
   assert.equal(await ledger.getAvailableBalance(f.seller.id),10900n);
   await ack.acknowledge(params);
   await ack.acknowledge({...params,idempotencyKey:randomUUID()});
   assert.equal(await ledger.getAvailableBalance(f.seller.id),10900n);
   assert.equal(await db.tradeAcknowledgment.count({where:{orderId:f.order.id,type:'BUYER_ACK_RECEIVED'}}),1);
   const audit=await db.auditLog.findFirst({where:{entityId:f.order.id,action:'TRADE_POLL_CONFIRMED'}});
   assert.equal(audit.afterState.verificationEvidence.offerStatus,'unknown');
   assert.match(JSON.stringify(audit.afterState.verificationEvidence),/BUYER_ACK/);
 });

 await check('a newly synced lookalike does not prove delivery of the purchased asset',async()=>{
   const buyer=await user(),f=await fixture(buyer);
   await db.inventoryAsset.update({where:{id:f.asset.id},data:{status:'RESERVED'}});
   await db.inventoryAsset.create({data:{ownerId:buyer.id,itemDefinitionId:f.item.id,assetExternalId:randomUUID(),status:'AVAILABLE'}});
   const {TradeInventoryDeltaService}=require('../dist/src/trades/trade-inventory-delta.service');
   const delta=new TradeInventoryDeltaService(db,{syncInventory:async()=>({status:'SUCCESS',stale:false})});
   assert.equal(await delta.verify(f.seller.id,buyer.id,'seller-steam','buyer-steam',f.asset.assetExternalId,f.item.marketHashName,{force:true,orderCreatedAt:f.order.createdAt}),'pending');
   assert.equal((await db.order.findUnique({where:{id:f.order.id}})).status,'WAITING_TRADE');
 });
 console.log(JSON.stringify({passed:passed.length,checks:passed},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());

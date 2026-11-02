'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ownedScheduleQuery}=require('../src/services/publishingScheduleQuery');
function store(owner='owner') {
  const calls=[];const snapshot={exists:true,data:()=>({user_id:owner})};
  const query={where:(...args)=>{calls.push(['where',...args]);return query;},orderBy:(...args)=>{calls.push(['orderBy',...args]);return query;},startAfter:s=>{assert.equal(s,snapshot);calls.push(['startAfter']);return query;},limit:n=>{calls.push(['limit',n]);return query;},doc:()=>({get:async()=>snapshot})};
  return {db:{collection:()=>query},calls};
}
test('time window and cursor remain bound to the authenticated owner',async()=>{
  const s=store();await ownedScheduleQuery(s.db,'owner',{limit:250,from:'2026-10-13T18:00:00+02:00',until:'2026-10-18T16:00:00Z',cursor:'owned_cursor'});
  assert.deepEqual(s.calls,[['where','user_id','==','owner'],['where','startTime','>=','2026-10-13T16:00:00.000Z'],['where','startTime','<=','2026-10-18T16:00:00.000Z'],['orderBy','startTime','desc'],['startAfter'],['limit',250]]);
});
test('foreign and malformed cursors cannot cross the ownership boundary',async()=>{
  await assert.rejects(ownedScheduleQuery(store('other').db,'owner',{limit:250,cursor:'foreign'}),e=>e.status===404);
  await assert.rejects(ownedScheduleQuery(store().db,'owner',{limit:250,cursor:'../foreign'}),e=>e.status===400);
});
test('invalid or reversed windows fail before a database query',async()=>{
  for(const bounds of [{from:'bad'},{until:[]},{from:'2026-10-18T16:00:00Z',until:'2026-10-13T16:00:00Z'}]) {
    const s=store();await assert.rejects(ownedScheduleQuery(s.db,'owner',{limit:250,...bounds}),e=>e.status===400);assert.equal(s.calls.length,0);
  }
});

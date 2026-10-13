'use strict';
const reject = (status, message) => { throw Object.assign(new Error(message), {status}); };
function isoBound(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) reject(400, 'Invalid schedule time window');
  return new Date(value).toISOString();
}
async function ownedScheduleQuery(db, userId, {limit, from, until, cursor}) {
  const lower = isoBound(from), upper = isoBound(until);
  if (lower && upper && lower > upper) reject(400, 'Invalid schedule time window');
  let query = db.collection('promotion_schedules').where('user_id', '==', userId);
  if (lower) query = query.where('startTime', '>=', lower);
  if (upper) query = query.where('startTime', '<=', upper);
  query = query.orderBy('startTime', 'desc');
  if (cursor) {
    if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(cursor)) reject(400, 'Invalid schedule cursor');
    const snapshot = await db.collection('promotion_schedules').doc(cursor).get();
    if (!snapshot.exists || snapshot.data().user_id !== userId) reject(404, 'Schedule cursor unavailable');
    query = query.startAfter(snapshot);
  }
  return query.limit(limit);
}
module.exports = {ownedScheduleQuery};

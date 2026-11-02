'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { determineContentIntent } = require('../src/services/publishingIntent');
const { checkPlatformCompliance } = require('../src/services/complianceService');

test('own-brand promotion does not falsely require a YouTube paid partnership', () => {
  const intent = determineContentIntent({ tiktok: { commercial: { yourBrand: true, isCommercial: true } }, youtube: { paidPromotion: false } });
  assert.equal(intent, 'commercial');
  assert.doesNotThrow(() => checkPlatformCompliance('youtube', { paidPromotion: false }, intent));
});
test('paid partnerships retain sponsored priority and disclosure enforcement', () => {
  for (const paid of [
    { tiktok: { commercial: { yourBrand: true, brandedContent: true } } },
    { instagram: { isPaidPartnership: true } },
    { youtube: { paidPromotion: true } },
  ]) {
    const intent = determineContentIntent({ reddit: { isPromotional: true }, ...paid });
    assert.equal(intent, 'sponsored');
    assert.throws(() => checkPlatformCompliance('youtube', { paidPromotion: false }, intent), /disclosure/);
  }
});
test('ordinary posts remain organic and legacy own-brand flags remain commercial', () => {
  assert.equal(determineContentIntent(), 'organic');
  assert.equal(determineContentIntent(null), 'organic');
  assert.equal(determineContentIntent({ tiktok: { yourBrand: true } }), 'commercial');
  assert.equal(determineContentIntent({ linkedin: { isPromotional: true } }), 'commercial');
});

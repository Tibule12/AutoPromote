import { paypalSubscriptionReturn, clearPaypalSubscriptionReturn } from '../paypalReturn';
test('PayPal approval survives the normal public pricing to hash route transition', () => {
  expect(paypalSubscriptionReturn({search:'',hash:'#/pricing?subscription_id=I-APPROVED&token=private'})).toBe('I-APPROVED');
  expect(paypalSubscriptionReturn({search:'?subscription_id=I-DIRECT',hash:'#/pricing'})).toBe('I-DIRECT');
  expect(paypalSubscriptionReturn({search:'',hash:'#/pricing'})).toBe(null);
});
test('verified checkout removes provider tokens while preserving the ordinary pricing route', () => {
  expect(clearPaypalSubscriptionReturn('https://autopromote.org/#/pricing?subscription_id=I-ONE&token=private&view=usage')).toBe('/#/pricing?view=usage');
  expect(clearPaypalSubscriptionReturn('https://autopromote.org/?subscription_id=I-ONE&ba_token=private#/pricing')).toBe('/#/pricing');
});

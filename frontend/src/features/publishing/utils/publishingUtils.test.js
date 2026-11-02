import { facebookPublisherPages } from './publishingUtils';

test('uses owned unified Page identities while stripping provider credentials', () => {
  const pages=facebookPublisherPages({raw:{facebook:{pages:[{
    id:'123',name:'AutoPromote',access_token:'private',
    instagram_business_account:{id:'456',username:'autopromote',access_token:'private'}
  }]}}});
  expect(pages).toEqual([{id:'123',name:'AutoPromote',instagram_business_account:{id:'456',username:'autopromote'}}]);
  expect(JSON.stringify(pages)).not.toContain('private');
});

test('accepts the linked Instagram Page metadata but never invents an unavailable identity', () => {
  expect(facebookPublisherPages({raw:{instagram:{pages:[{id:'123',name:'Page'}]}}})).toEqual([{id:'123',name:'Page'}]);
  expect(facebookPublisherPages({raw:{facebook:{pages:[{name:'No identifier'}]}}})).toEqual([]);
  expect(facebookPublisherPages(null)).toEqual([]);
  expect(facebookPublisherPages({raw:{facebook:{pages:'bad'}}})).toEqual([]);
});

const { groundedPropItems } = require('../src/services/screenplayGroundingSchema');
test('prop choices are paired with their actual source quote, preserving Unicode', () => {
  const quotes=['A paper boat rests on a dark timber desk.','Léa holds a café cup.'];
  const schema=groundedPropItems(quotes,['Léa']);
  for(const branch of schema.anyOf)for(const name of branch.properties.name.enum){
    expect(branch.properties.sourceQuote.enum[0]).toContain(name);
    expect(name).not.toBe('Léa');
  }
  const boat=schema.anyOf.filter(b=>b.properties.name.enum.includes('paper boat'));
  expect(boat).toHaveLength(1);
  expect(boat[0].properties.sourceQuote.enum).toEqual([quotes[0]]);
  expect(schema.anyOf[1].properties.name.enum).toContain('café cup');
});
test('empty or punctuation-only action cannot produce an invented prop',()=>{
  expect(groundedPropItems([])).toBeNull();
  expect(groundedPropItems(['...'])).toBeNull();
});

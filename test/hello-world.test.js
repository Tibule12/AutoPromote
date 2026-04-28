const { v4: uuidv4 } = require('uuid');

test('hello world!', () => {
    expect(uuidv4()).toBeDefined();
});
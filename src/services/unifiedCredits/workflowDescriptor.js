const { digest } = require('./workerVerification');

// Quote/admission records retain the exact canonical request digest and source
// bindings. The full request travels over the existing checked HTTP/worker
// path, rather than exceeding Firestore's bounded input or wallet records.
function compactWorkflowDescriptor(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const { requestBody, ...bindings } = input;
  return { ...bindings, ...(requestBody === undefined ? {} : { requestBodyHash: digest(requestBody) }) };
}
function matchesWorkflowRequest(input, requestBody) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const expected = input.requestBody === undefined ? input.requestBodyHash : digest(input.requestBody);
  return typeof expected === 'string' && /^[a-f0-9]{64}$/.test(expected) &&
    (input.requestBodyHash === undefined || input.requestBodyHash === expected) &&
    expected === digest(requestBody);
}
module.exports = { compactWorkflowDescriptor, matchesWorkflowRequest };

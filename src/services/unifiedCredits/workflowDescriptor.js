const { digest } = require('./workerVerification');

// The immutable quoted input retains the full request and is checked again at
// admission. Execution descriptors need its digest and source bindings, rather
// than a second large LUT/animation payload inside the bounded wallet record.
function compactWorkflowDescriptor(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const { requestBody, ...bindings } = input;
  return { ...bindings, ...(requestBody === undefined ? {} : { requestBodyHash: digest(requestBody) }) };
}
module.exports = { compactWorkflowDescriptor };

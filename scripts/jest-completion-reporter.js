const fs = require("fs");

// The launcher checks this receipt as well as Jest's exit code. A drained Node
// event loop or an accidental process.exit(0) cannot turn an incomplete run green.
module.exports = class JestCompletionReporter {
  constructor() {
    this.completedCases = 0;
  }

  onTestCaseResult(_test, result) {
    this.completedCases += 1;
    // The default reporter buffers a large suite until its last case finishes.
    // Keep CI visibly progressing during the full Studio component suite.
    if (this.completedCases % 25 === 0 || result.status === "failed")
      console.log(
        `[exec-jest] ${this.completedCases} test cases finished; ${result.fullName} (${result.status}).`
      );
  }

  onRunComplete(_contexts, result) {
    if (!process.env.AUTOPROMOTE_JEST_SUMMARY_FILE) return;
    fs.writeFileSync(
      process.env.AUTOPROMOTE_JEST_SUMMARY_FILE,
      JSON.stringify({
        completed: !result.wasInterrupted,
        // Jest assigns aggregate.success after calling reporters.
        success:
          !result.wasInterrupted &&
          !result.runExecError &&
          !result.numFailedTests &&
          !result.numFailedTestSuites &&
          !result.numRuntimeErrorTestSuites &&
          !result.snapshot?.failure,
        numTotalTests: result.numTotalTests,
        numTotalTestSuites: result.numTotalTestSuites,
        numPassedTests: result.numPassedTests,
        numFailedTests: result.numFailedTests,
        numFailedTestSuites: result.numFailedTestSuites,
        numRuntimeErrorTestSuites: result.numRuntimeErrorTestSuites,
      })
    );
  }
};

let React;
let _render, _screen, _fireEvent;
let _ScheduleCard;
try {
  React = require("react");
  ({ render: _render, screen: _screen, fireEvent: _fireEvent } = require("@testing-library/react"));
  _ScheduleCard = require("../components/ScheduleCard");
} catch (e) {
  // Running under node-only server tests where react & dom libs are not installed; skip UI tests
  React = null;
}

describe("ScheduleCard", () => {
  if (!React) return it.skip("skipped in non-frontend jest environment", () => {});
  describe.skip("ScheduleCard (frontend-only test) - skipped in server project", () => {
    it("moved to frontend __tests__", () => {});
  });
});

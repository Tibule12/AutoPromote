import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { publicEntryRoute } from "../utils/publicEntryRoute";
import { requestedWorkspace, workspaceDestination } from "../utils/workspaceDestination";
import { useSubscription } from "../hooks/useSubscription";
import AuthContext from "../contexts/AuthContext";
import ProfilePanel from "../UserDashboardTabs/ProfilePanel";
import BottomNav from "../components/BottomNav";
import { FOOTER_GROUPS } from "../components/public/PublicFooter";
import { featureCards, pricingCards } from "../data/landingPageData";

const retired = [
  "analytics",
  "metrics",
  "smart-promo",
  "smart_promo",
  "smartpromo",
  "idea-video",
  "idea_video",
  "idea-to-video",
  "idea_to_video",
];
test.each(retired)("old %s links reopen an active workspace", alias => {
  const target = /analytics|metrics/.test(alias) ? "schedules" : "viral_clip_studio";
  expect(publicEntryRoute({ pathname: `/${alias}` })).toBe(`/#/?tab=${target}`);
  expect(publicEntryRoute({ pathname: `/${alias}/saved-project` })).toBe(`/#/?tab=${target}`);
  expect(workspaceDestination(alias)).toBe(target);
  expect(requestedWorkspace(`?tab=${alias}`)).toBe(target);
});
test("team invitation IDs remain separate from workspace navigation", () => {
  expect(requestedWorkspace("?workspace=workspace-private-id&invite=invite-1")).toBeNull();
});
test("old subscription payloads cannot restore retired features or change balances", () => {
  const profile = {
    planId: "pro",
    monthlyCredits: { allocation: 500, remaining: 123 },
    topUpBalance: 19,
    totalCredits: 142,
    editing: {
      features: {
        smartPromoSummary: { enabled: true },
        viralClipStudio: { enabled: true },
        findViralClips: { enabled: true },
      },
    },
  };
  const before = JSON.stringify(profile);
  function Probe() {
    const s = useSubscription();
    return (
      <div>
        {JSON.stringify({
          promo: s.canUseFeature("smartPromoSummary"),
          studio: s.canUseFeature("viralClipStudio"),
          scan: s.canUseFeature("findViralClips"),
          credits: s.credits,
          editing: s.editing,
        })}
      </div>
    );
  }
  const { container } = render(
    <AuthContext.Provider value={{ profile }}>
      <Probe />
    </AuthContext.Provider>
  );
  const s = JSON.parse(container.textContent);
  expect(s.promo).toBe(false);
  expect(s.studio).toBe(true);
  expect(s.scan).toBe(true);
  expect(s.credits).toEqual({
    monthlyAllocation: 500,
    monthlyRemaining: 123,
    topUpBalance: 19,
    remaining: 142,
  });
  expect(s.editing.features.smartPromoSummary).toBeUndefined();
  expect(JSON.stringify(profile)).toBe(before);
});
test("Overview, mobile navigation, marketing and plan descriptions expose active products", () => {
  const navigate = jest.fn();
  render(
    <>
      <ProfilePanel user={{}} stats={{ views: 99 }} onNavigate={navigate} defaultsPlatforms={[]} />
      <BottomNav activeTab="profile" onNav={navigate} />
    </>
  );
  expect(screen.queryByText(/Smart Promo|Idea.to.Video|Analytics/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Find Viral Clips" }));
  expect(navigate).toHaveBeenCalledWith("clip_studio");
  fireEvent.click(screen.getByRole("button", { name: "Open Queue" }));
  expect(navigate).toHaveBeenCalledWith("schedules");
  expect(JSON.stringify({ FOOTER_GROUPS, featureCards, pricingCards })).not.toMatch(
    /analytics|smart.?promo|idea.to.video/i
  );
});

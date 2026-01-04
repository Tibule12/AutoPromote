/* eslint-env cypress */
/* global cy */

describe("TikTok UX enforcement on Content Upload", () => {
  beforeEach(() => {
    // Stubs and E2E environment setup so the upload UI renders deterministically
    // Use wildcard intercepts to match absolute or proxy'ed API base URLs
    cy.intercept("GET", "**/api/content/my-content", {
      statusCode: 200,
      body: { content: [], meta: {} },
    }).as("myContent");

    cy.intercept("GET", "**/api/tiktok/creator_info", {
      statusCode: 200,
      body: {
        creator: {
          can_post: true,
          interactions: { comments: true, duet: true, stitch: true },
          max_video_post_duration_sec: 60,
        },
      },
    }).as("creatorInfo");

    cy.visit("/#/upload", {
      onBeforeLoad(win) {
        // Provide runtime flags and a test user in localStorage so the app enters dashboard
        win.__E2E_BYPASS = true;
        win.__E2E_BYPASS_UPLOADS = true;
        try {
          win.localStorage.setItem(
            "user",
            JSON.stringify({ uid: "e2e-user", email: "e2e@local", token: "e2e-test-token" })
          );
        } catch (e) {}
      },
    });

    // Wait for app to fetch my content (ensures app reached dashboard state)
    cy.wait("@myContent");

    // Debugging: dump minimal document and window state to logs to verify page rendered and E2E flags applied
    cy.document().then(doc =>
      cy.log(
        "document.body length=" + (doc.body && doc.body.innerHTML ? doc.body.innerHTML.length : "0")
      )
    );
    cy.window().then(win => {
      try {
        cy.log("localStorage.user=" + win.localStorage.getItem("user"));
      } catch (e) {
        cy.log("error reading localStorage");
      }
      try {
        cy.log("__E2E_BYPASS=" + (win.__E2E_BYPASS === true));
      } catch (e) {}
    });
  });

  it("requires privacy and consent, rejects overlays and enforces branded content visibility", () => {
    // Stub creator_info to allow posting and set interaction permissions
    cy.intercept("GET", "/api/tiktok/creator_info", {
      statusCode: 200,
      body: {
        creator: {
          can_post: true,
          interactions: { comments: true, duet: true, stitch: true },
          max_video_post_duration_sec: 60,
        },
      },
    }).as("creatorInfo");

    // Wait for the upload form to render, then select TikTok target and ensure guidelines are visible
    // Ensure form rendered and list platform tiles
    cy.get("#content-title", { timeout: 15000 }).should("be.visible");
    cy.get(".platform-name", { timeout: 10000 }).should($els => {
      if ($els.length === 0) {
        throw new Error("No platform tiles found; page may not be fully rendered");
      }
    });

    // Log platform names for debugging and click TikTok tile if present
    cy.get(".platform-name").then($els => {
      const names = Array.from($els).map(el => el.innerText.trim());
      // Cypress will show this log in the run output
      cy.log("Platform names found: " + JSON.stringify(names));
      const idx = names.findIndex(n => /tiktok/i.test(n));
      if (idx === -1)
        throw new Error("TikTok platform tile not found; platform names: " + JSON.stringify(names));
      // Click the parent tile of the matched name
      cy.wrap($els[idx]).click();
    });
    cy.contains("no watermarks", { timeout: 5000 }).should("be.visible");
    cy.contains("9:16", { timeout: 5000 }).should("be.visible");

    // Attach a dummy file programmatically (avoid plugin dependency)
    cy.get('input[type="file"]').then($input => {
      const blob = new Blob(["dummy"], { type: "video/mp4" });
      const testFile = new File([blob], "test.mp4", { type: "video/mp4" });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(testFile);
      $input[0].files = dataTransfer.files;
      $input[0].dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Ensure creator_info was fetched and processed
    cy.wait("@creatorInfo", { timeout: 5000 });

    // Try submit without setting privacy/consent - expect error
    cy.contains("button", /Upload Content/i).click();
    cy.contains(/Please select a privacy option for TikTok posts/i).should("be.visible");

    // Open TikTok options, set privacy to EVERYONE and check consent
    cy.get(".tiktok-options").within(() => {
      cy.get("select").select("EVERYONE");
      cy.get('input[type="checkbox"]').last().check({ force: true }); // consent checkbox is last
    });

    // Add overlay and attempt upload -> should get watermark rejection
    cy.get('input[placeholder="Add overlay text"]').type("Test watermark");
    cy.contains("button", /Upload Content/i).click();
    cy.contains(/TikTok uploads must not contain watermarks or overlay text/i).should("be.visible");

    // Clear overlay, open TikTok options and enable commercial + brandedContent, set privacy to SELF_ONLY to provoke branded-content visibility error
    cy.get('input[placeholder="Add overlay text"]').clear();
    cy.get(".tiktok-options").within(() => {
      cy.get('input[type="checkbox"]').first().check({ force: true }); // commercial checkbox
      // programmatically set privacy to SELF_ONLY
      cy.get("select").select("SELF_ONLY");
      // ensure brandedContent is checked via label selection
      cy.contains("Branded Content").parent().find('input[type="checkbox"]').check({ force: true });
    });

    cy.contains("button", /Upload Content/i).click();
    cy.contains(/Branded content visibility cannot be set to private/i).should("be.visible");
  });
});

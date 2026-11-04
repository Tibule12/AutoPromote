// Layout checks run only inside the owned, loopback community browser fixture.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

function createMobileFormChecks(directory) {
  const results = [];
  return async function check(page, name, selector) {
    if (process.env.MOBILE_FORMS_QA !== "true") return;
    const viewport = page.viewportSize();
    const fingerprint = async () =>
      crypto
        .createHash("sha256")
        .update(
          await page
            .locator(selector)
            .first()
            .evaluate(root =>
              JSON.stringify(
                [...root.querySelectorAll("input,select,textarea")].map(el => [
                  el.name || el.getAttribute("aria-label") || el.type,
                  el.value,
                  el.checked,
                ])
              )
            )
        )
        .digest("hex");
    // Keep field values private; only compare an in-memory digest across resize.
    const before = await fingerprint();
    for (const width of [320, 360, 390, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const root = page.locator(selector).first();
      await root.waitFor({ state: "visible" });
      await root.scrollIntoViewIfNeeded();
      // Let existing CSS transitions settle before measuring actual geometry.
      await page.waitForTimeout(200);
      const result = await root.evaluate(
        (root, { name, width }) => {
          const visible = el =>
            !!el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
          const fields = [...root.querySelectorAll("input,select,textarea,button")]
            .filter(visible)
            .filter(el => !["hidden", "checkbox", "radio", "range"].includes(el.type));
          const label = root.querySelector(".password-form label");
          let passwordLabelContrast = null;
          if (label) {
            const rgb = color => color.match(/[\d.]+/g)?.map(Number);
            const lum = channels =>
              channels
                .slice(0, 3)
                .map(c => {
                  c /= 255;
                  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
                })
                .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
            const foreground = rgb(getComputedStyle(label).color);
            for (let p = label; p; p = p.parentElement) {
              const background = rgb(getComputedStyle(p).backgroundColor);
              if (background && (background[3] ?? 1) >= 0.8) {
                const a = lum(foreground),
                  b = lum(background);
                passwordLabelContrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
                break;
              }
            }
          }
          return {
            name,
            width,
            pageWidth: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth,
            rootWidth: root.getBoundingClientRect().width,
            passwordLabelContrast,
            narrowLabels: [
              ...root.querySelectorAll(
                ".terms-row .form-label, .community-destination-picker label"
              ),
            ]
              .filter(visible)
              .filter(
                el => el.textContent.trim().length > 20 && el.getBoundingClientRect().width < 80
              ).length,
            fields: fields.map(el => {
              const r = el.getBoundingClientRect(),
                s = getComputedStyle(el);
              let scrollContainer = null;
              for (let p = el.parentElement; p && root.contains(p); p = p.parentElement) {
                if (
                  ["auto", "scroll"].includes(getComputedStyle(p).overflowX) &&
                  p.scrollWidth > p.clientWidth
                ) {
                  scrollContainer = p.className;
                  break;
                }
              }
              return {
                tag: el.tagName,
                label:
                  el.getAttribute("aria-label") ||
                  el.labels?.[0]?.textContent?.trim().slice(0, 90) ||
                  el.textContent.trim().slice(0, 90) ||
                  el.placeholder,
                left: r.left,
                right: r.right,
                width: r.width,
                height: r.height,
                fontSize: parseFloat(s.fontSize),
                disabled: el.disabled,
                scrollContainer,
              };
            }),
          };
        },
        { name, width }
      );
      result.issues = result.fields.flatMap(f => [
        ...(!f.scrollContainer && (f.left < -1 || f.right > width + 1)
          ? [`offscreen: ${f.label}`]
          : []),
        ...(width <= 430 && f.height < 43.5
          ? [`small target: ${f.label} (${Math.round(f.height)}px)`]
          : []),
        ...(width <= 430 && f.tag !== "BUTTON" && f.fontSize < 16
          ? [`small field text: ${f.label}`]
          : []),
      ]);
      if (result.narrowLabels) result.issues.push("Form labels are squeezed into narrow columns");
      if (result.passwordLabelContrast != null && result.passwordLabelContrast < 4.5)
        result.issues.push(
          "Password labels have insufficient contrast against the form background"
        );
      results.push(result);
      fs.writeFileSync(
        path.join(directory, "mobile-form-layout.json"),
        JSON.stringify(results, null, 2) + "\n"
      );
      await root.screenshot({ path: path.join(directory, `mobile-${name}-${width}.png`) });
      if (name.endsWith("-connection")) {
        const card = root
          .locator(".connection-platform-card")
          .filter({ has: page.locator(".community-destination-picker") });
        await card.screenshot({ path: path.join(directory, `mobile-${name}-card-${width}.png`) });
      }
    }
    await page.setViewportSize(viewport);
    assert.equal(await fingerprint(), before, `${name}: resizing changed entered form values`);
    if (process.env.MOBILE_FORMS_ASSERT === "true") {
      const failures = results.filter(r => r.name === name && r.issues.length);
      assert.equal(
        failures.length,
        0,
        JSON.stringify(failures.map(r => ({ name, width: r.width, issues: r.issues })))
      );
    }
  };
}
module.exports = { createMobileFormChecks };

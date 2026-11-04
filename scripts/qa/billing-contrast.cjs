const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
async function checkBillingContrast(page, directory, width) {
  const samples = await page.locator(".paypal-subscription-panel").evaluate(root => {
    const rgb = value => {
      const result = value.match(/[\d.]+/g)?.map(Number);
      return result?.length >= 3 ? [...result.slice(0, 3), result[3] ?? 1] : [0, 0, 0, 0];
    };
    const over = (front, back) => [
      ...front.slice(0, 3).map((value, i) => value * front[3] + back[i] * (1 - front[3])),
      1,
    ];
    const background = element => {
      const chain = [];
      for (let p = element; p; p = p.parentElement) chain.unshift(p);
      return chain.reduce(
        (result, p) => over(rgb(getComputedStyle(p).backgroundColor), result),
        [255, 255, 255, 1]
      );
    };
    const luminance = color =>
      color
        .slice(0, 3)
        .map(value => value / 255)
        .map(value => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
        .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    const selectors =
      ".feature-name,.feature-value,.plan-price .price,.plan-price .period,.free-label,.plan-editing-title,.plan-editing-copy,.plan-pill,.plan-editing-badge,.topup-credits,.topup-price,.topup-name,.topup-savings,.topup-copy,.paypal-sdk-notice,.billing-legal-footer,.billing-legal-footer a,.billing-payment-card p,.billing-payment-card dt,.billing-payment-card dd,.secure-payment-badge p,.current-plan-badge,h2,h3,h4";
    return [...root.querySelectorAll(selectors)]
      .filter(
        element =>
          element.getClientRects().length && getComputedStyle(element).visibility !== "hidden"
      )
      .map(element => {
        const style = getComputedStyle(element),
          fg = rgb(style.color),
          bg = background(element);
        const foreground = luminance(over(fg, bg)),
          back = luminance(bg);
        return {
          label: (element.innerText || "").trim().slice(0, 80),
          selector: element.className || element.tagName,
          ratio: (Math.max(foreground, back) + 0.05) / (Math.min(foreground, back) + 0.05),
        };
      });
  });
  fs.writeFileSync(
    path.join(directory, `billing-contrast-${width}.json`),
    JSON.stringify(samples, null, 2)
  );
  assert.ok(samples.length >= 50, "Expand the actual billing catalogue before checking its text.");
  assert.deepEqual(
    samples.filter(sample => sample.ratio < 4.5),
    [],
    `Billing contrast below 4.5:1 at ${width}px`
  );
  return samples;
}
module.exports = { checkBillingContrast };

const assert = require("assert/strict");

// Check the usable viewport of the timeline, not its intentionally scrollable
// inner time axis. Functional playback checks alone cannot catch grid clipping.
async function assertStudioTimelineLayout(page, label) {
  const geometry = await page.evaluate(() => {
    const rect = selector => {
      const node = document.querySelector(selector);
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    const layout = document.querySelector(".studio-layout");
    const style = getComputedStyle(layout);
    return {
      layout: rect(".studio-layout"),
      dock: rect(".studio-pro-timeline-dock"),
      timeline: rect(".studio-pro-timeline"),
      toolbar: rect(".pro-timeline-toolbar"),
      scroll: rect(".pro-timeline-scroll"),
      preview: rect(".phone-preview-container"),
      tools: rect(".creative-tool-rail"),
      paddingLeft: parseFloat(style.paddingLeft),
      paddingRight: parseFloat(style.paddingRight),
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  const { layout, dock, timeline, toolbar, scroll, preview, tools } = geometry;
  assert(
    Math.abs(dock.left - layout.left - geometry.paddingLeft) <= 2,
    `${label}: timeline must start at the workspace left edge`
  );
  assert(
    Math.abs(dock.right - layout.right + geometry.paddingRight) <= 2,
    `${label}: timeline must reach the workspace right edge`
  );
  assert(
    timeline.width >= dock.width - 4 &&
      toolbar.width >= timeline.width - 4 &&
      scroll.width >= timeline.width - 4,
    `${label}: timeline content is clipped`
  );
  assert(scroll.height > 20, `${label}: tracks have no usable height`);
  assert(
    preview.bottom <= dock.top + 2 && tools.bottom <= dock.top + 2,
    `${label}: timeline overlaps the monitor or tool rail`
  );
  assert(
    dock.bottom <= geometry.viewport.height + 2 && dock.top >= 0,
    `${label}: timeline extends outside the screen`
  );
  return { label, ...geometry };
}

async function clickStudioControl(page, control, options) {
  const menu = control
    .locator(
      "xpath=ancestor::details[contains(@class, 'studio-control-menu') or contains(@class, 'studio-project-rail__head')]"
    )
    .last();
  if ((await menu.count()) && !(await menu.evaluate(node => node.open)))
    await menu.locator(":scope > summary").click();
  await control.click(options);
}

module.exports = { assertStudioTimelineLayout, clickStudioControl };

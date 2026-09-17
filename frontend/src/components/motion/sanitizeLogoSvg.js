import DOMPurify from "dompurify";

const LOCAL_IMAGE_DATA = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i;

export function sanitizeLogoSvg(markup) {
  const sanitized = DOMPurify.sanitize(String(markup || ""), {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject", "animate", "animateMotion", "animateTransform", "set"],
  });
  const documentNode = new DOMParser().parseFromString(sanitized, "image/svg+xml");
  const root = documentNode.documentElement;
  if (root.localName !== "svg" || documentNode.querySelector("parsererror")) {
    throw new Error("Invalid SVG logo");
  }

  root.querySelectorAll("*").forEach(node => {
    Array.from(node.attributes).forEach(attribute => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on") || (name === "style" && /url\s*\(/i.test(value))) {
        node.removeAttribute(attribute.name);
      } else if (
        (name === "href" || name === "xlink:href") &&
        !value.startsWith("#") &&
        !LOCAL_IMAGE_DATA.test(value)
      ) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  return new XMLSerializer().serializeToString(root);
}

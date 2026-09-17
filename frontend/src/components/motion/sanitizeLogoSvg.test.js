import { sanitizeLogoSvg } from "./sanitizeLogoSvg";

describe("logo SVG import", () => {
  it("retains local geometry while removing executable content and external references", () => {
    const clean = sanitizeLogoSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">' +
        '<defs><linearGradient id="shine"/></defs>' +
        '<script>alert(2)</script><foreignObject><div>unsafe</div></foreignObject>' +
        '<rect width="10" height="10" fill="url(#shine)" style="fill:url(https://evil.example/x)"/>' +
        '<image href="https://evil.example/logo.svg"/><use href="#shine"/>' +
        '</svg>'
    );
    expect(clean).toContain("linearGradient");
    expect(clean).toContain('fill="url(#shine)"');
    expect(clean).not.toContain("<use");
    expect(clean).not.toMatch(/onload|<script|foreignObject|evil\.example/i);
  });

  it("rejects non-SVG markup", () => {
    expect(() => sanitizeLogoSvg("<html><script>alert(1)</script></html>")).toThrow("Invalid SVG logo");
  });
});

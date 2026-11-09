import ProductTourPlayer from "./ProductTourPlayer";

export default function LandingWorkflow() {
  return (
    <section className="lp-section lp-workflow-section" id="workflow" aria-labelledby="workflow-heading">
      <div className="lp-section-heading">
        <p className="lp-eyebrow">THE AUTOPROMOTE FLOW</p>
        <h2 id="workflow-heading">Make it yours.<br /><span>Then make it seen.</span></h2>
        <p>From the first upload to your next release.<br />See the real workspace, one chapter at a time.</p>
      </div>
      <ProductTourPlayer />
    </section>
  );
}

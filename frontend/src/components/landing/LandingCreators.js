const creators = [
  ["01", "Podcasters", "Keep the conversation. Lose the editing marathon.", "host"],
  ["02", "Interviews & conversations", "Give every angle and every voice its moment.", "guest"],
  ["03", "Social-first creators", "Turn a longer story into your next short-form cut.", "wide"],
];
export default function LandingCreators() {
  return (
    <section className="lp-section" id="creators" aria-labelledby="creators-heading">
      <div className="lp-section-heading lp-heading-inline">
        <div>
          <p className="lp-eyebrow">FOR THE PEOPLE BEHIND THE CAMERA</p>
          <h2 id="creators-heading">
            You bring the story.
            <br />
            <span>We bring the tools.</span>
          </h2>
        </div>
        <p>
          For the conversations, ideas and perspectives
          <br />
          that deserve to get out into the world.
        </p>
      </div>
      <div className="lp-creators">
        {creators.map(([number, title, copy]) => (
          <article className="lp-creator-editorial" key={number}>
            <span>{number} / MADE FOR YOU</span>
            <h3>{title}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

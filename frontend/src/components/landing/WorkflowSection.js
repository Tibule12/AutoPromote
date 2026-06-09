const WorkflowSection = ({ steps }) => (
  <div className="ap-workflow-track">
    {steps.map((step, index) => (
      <div key={step.title} className="ap-step-wrap">
        <div className="ap-step-card ap-reveal">
          <span className="ap-step-index">{index + 1}</span>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
        </div>
        {index !== steps.length - 1 ? <span className="ap-step-arrow">↓</span> : null}
      </div>
    ))}
  </div>
);

export default WorkflowSection;

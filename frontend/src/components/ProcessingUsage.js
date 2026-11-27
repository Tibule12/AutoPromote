import React from "react";
export default function ProcessingUsage({ usage, purchasedCredits, promotionalCredits }) {
  if (!usage) return <p>Sign in to view your processing allowance and reset time.</p>;
  const storage = usage.storage || {};
  return (
    <section className="processing-usage" aria-label="Processing usage">
      <h3>Your processing allowance</h3>
      <p>
        {usage.planId === "free" ? "AutoPromote Free" : "AutoPromote Plus"} ·{" "}
        {usage.remainingPercent}% remaining
      </p>
      <progress
        aria-label="Processing allowance remaining"
        value={usage.remainingPercent}
        max="100"
      />
      <p>
        {usage.remaining} of {usage.allowance} processing tokens available
      </p>
      <p>
        Next reset:{" "}
        <time dateTime={usage.nextResetAt}>
          {new Date(usage.nextResetAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </time>
      </p>
      <p>
        Rolling 30-day limit: {usage.rollingSpentTokens} spent · {usage.reservedTokens} reserved ·{" "}
        {usage.rolling30DayLimit} maximum
      </p>
      <p>
        Storage:{" "}
        {storage.measured
          ? `${(storage.usedBytes / 1073741824).toFixed(2)} GB used`
          : "Usage measurement pending"}{" "}
        · {(storage.limitBytes / 1073741824).toFixed(0)} GB proposed capacity
      </p>
      {usage.remaining === 0 && (
        <p role="status">
          {usage.exhaustionReason === "rolling"
            ? "Your rolling 30-day processing capacity is currently used. An allowance reset does not clear earlier usage."
            : "Your cloud processing allowance is currently used. Wait for the reset and rolling capacity to become available."}
          {" "}Your projects, timeline and supported local editing remain available.
        </p>
      )}
      {usage.reservedTokens > 0 && <p>{usage.reservedTokens} tokens are reserved for unfinished jobs. Their status must be confirmed before reserved capacity can be released.</p>}
      <p>
        Supported local editing and previews use no cloud processing tokens. Expensive jobs require
        an estimate before you run them. No automatic overage fees.
      </p>
      {purchasedCredits != null && (
        <p>
          Existing credits (legacy wallet): {purchasedCredits}. Preserved separately; processing tokens do
          not convert this balance.
        </p>
      )}
      {promotionalCredits != null && (
        <p>
          Existing promotional credits remaining: {promotionalCredits}. Their original terms remain
          in effect.
        </p>
      )}
    </section>
  );
}

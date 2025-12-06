import React from 'react';
import HistogramChart from './HistogramChart';

export default function PreviewCard({ decision, test, serverSimulation }) {
  if (!decision) return null;
  const samples = (decision && decision.simulation && decision.simulation.samples) || [];
  // If serverSimulation provided explicitly via props, prefer it
  const serverSim = (serverSimulation && serverSimulation.simulation) ? serverSimulation.simulation : (decision && decision.serverSimulation ? decision.serverSimulation : null);
  const samplesToUse = (serverSim && serverSim.samples && serverSim.samples.length) ? serverSim.samples : samples;
  // Determine the winning variant from the test if available
  const winningVariant = test && decision && decision.winner ? (test.variants || []).find(v => v.id === decision.winner) : null;
  const currentBudget = (winningVariant && winningVariant.promotionSettings && typeof winningVariant.promotionSettings.budget === 'number') ? winningVariant.promotionSettings.budget : 0;
  const currentViews = (winningVariant && winningVariant.metrics && typeof winningVariant.metrics.views === 'number') ? winningVariant.metrics.views : 0;
  const histogramBins = (() => {
    if (!samplesToUse.length) return null;
    const bins = 10;
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const width = (max - min) / bins || 1;
    const counts = new Array(bins).fill(0);
    for (const s of samplesToUse) {
      let idx = Math.floor((s - min) / width);
      if (idx < 0) idx = 0;
      if (idx >= bins) idx = bins - 1;
      counts[idx]++;
    }
    const maxCount = Math.max(...counts);
    return { min, max, width, counts, maxCount };
  })();
  const [budgetPct, setBudgetPct] = React.useState(0);
  const budgetChangePreview = (() => {
    // compute new budget & views with linear scaling assumption
    const pct = Number(budgetPct) || 0;
    const newBudget = currentBudget * (1 + pct / 100);
    const viewsPerBudget = currentBudget > 0 ? (currentViews / currentBudget) : (currentViews || 1000);
    const newViews = currentBudget > 0 ? Math.round(viewsPerBudget * newBudget) : Math.round(currentViews + (newBudget * (viewsPerBudget || 1000)));
    const deltaViews = newViews - currentViews;
    const deltaConversions = (decision.incConversionsPer1000Views || 0) * (deltaViews / 1000);
    const deltaRevenue = (decision.estimatedRevenueChangePer1000Views || 0) * (deltaViews / 1000);
    return { pct, newBudget, newViews, deltaViews, deltaConversions, deltaRevenue };
  })();
  const p50Val = (serverSim && typeof serverSim.p50 === 'number') ? serverSim.p50 : (decision.simulation && decision.simulation.p50) ? decision.simulation.p50 : 0;
  const p95Val = (serverSim && typeof serverSim.p95 === 'number') ? serverSim.p95 : (decision.simulation && decision.simulation.p95) ? decision.simulation.p95 : 0;

  return (
    <div style={{ padding: 12, borderRadius: 8, background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.04)', marginTop: 12 }}>
      <h4 style={{ margin: 0 }}>Autopilot Preview</h4>
      <div style={{ marginTop: 8 }}>Winner: <strong>{decision.winner}</strong></div>
      <div>Confidence: <strong>{decision.confidence}%</strong></div>
      <div>Predicted uplift: <strong>{decision.predictedUplift ? `${Math.round(decision.predictedUplift)}%` : '-'}</strong></div>
      <div>Inc conv/1k views: <strong>{typeof decision.incConversionsPer1000Views === 'number' ? decision.incConversionsPer1000Views.toFixed(2) : '-'}</strong></div>
      <div>Est rev/1k views: <strong>{typeof decision.estimatedRevenueChangePer1000Views === 'number' ? `$${decision.estimatedRevenueChangePer1000Views.toFixed(2)}` : '-'}</strong></div>
      <div>Baseline conv rate: <strong>{typeof decision.baselineRate === 'number' ? `${(decision.baselineRate * 100).toFixed(3)}%` : '-'}</strong></div>
      <div>Top conv rate: <strong>{typeof decision.topRate === 'number' ? `${(decision.topRate * 100).toFixed(3)}%` : '-'}</strong></div>
      <div>Risk score: <strong>{typeof decision.riskScore === 'number' ? `${decision.riskScore}%` : '-'}</strong></div>
      <div style={{ marginTop: 8, color: '#666' }}>Reason: {decision.reason}</div>
      <div style={{ marginTop: 8, color: '#333' }}>
        <strong>Why this choice?</strong>
        <div style={{ marginTop: 6, color: '#666' }}>
          The top variant's conversion rate is {typeof decision.topRate === 'number' ? `${(decision.topRate * 100).toFixed(3)}%` : '-'} vs baseline {typeof decision.baselineRate === 'number' ? `${(decision.baselineRate * 100).toFixed(3)}%` : '-'}, predicted uplift of {typeof decision.predictedUplift === 'number' ? `${Math.round(decision.predictedUplift)}%` : '-'} with {typeof decision.confidence === 'number' ? `${Math.round(decision.confidence)}%` : '-'} confidence. Risk score: {typeof decision.riskScore === 'number' ? `${Math.round(decision.riskScore)}%` : '-'}.
        </div>
      </div>
      {histogramBins ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: '0.9rem', color: '#333', marginBottom: 6 }}><strong>Simulation</strong> (delta conv rate distribution)</div>
          <div style={{ display: 'block', height: 120 }}>
            <HistogramChart samples={samplesToUse} bins={10} />
          </div>
          <div style={{ fontSize: '0.8rem', color: '#777', marginTop: 6 }}>
            Median: <strong>{(p50Val * 100).toFixed(2)}%</strong> — 95th percentile: <strong>{(p95Val * 100).toFixed(2)}%</strong>
          </div>
        </div>
      ) : null}
      <div style={{ marginTop: 12 }}>
        <h5 style={{ margin: '6px 0' }}>Budget What-If Simulator</h5>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: '0.9rem' }}>Budget change (%)</label>
          <input type='number' value={budgetPct} onChange={e => setBudgetPct(e.target.value)} style={{ width: 80 }} />
          <div style={{ fontSize: '0.85rem', color: '#666' }}>New budget: <strong>${budgetChangePreview.newBudget.toFixed(2)}</strong></div>
        </div>
        <div style={{ marginTop: 8 }}>
          {serverSimulation && serverSimulation.budgetSimulation ? (
            <div>
              <div>Expected change in views: <strong>{serverSimulation.budgetSimulation.deltaViews}</strong></div>
              <div>Expected change in conversions: <strong>{Number(serverSimulation.budgetSimulation.deltaConversions).toFixed(2)}</strong></div>
              <div>Estimated change in revenue: <strong>${Number(serverSimulation.budgetSimulation.deltaRevenue).toFixed(2)}</strong></div>
            </div>
          ) : (
            <>
              <div>Expected change in views: <strong>{budgetChangePreview.deltaViews}</strong></div>
              <div>Expected change in conversions: <strong>{budgetChangePreview.deltaConversions.toFixed(2)}</strong></div>
              <div>Estimated change in revenue: <strong>${budgetChangePreview.deltaRevenue.toFixed(2)}</strong></div>
            </>
          )}
          <div style={{ marginTop: 8, color: '#777', fontSize: '0.85rem' }}>
            Note: This is a heuristic simulation that assumes views scale linearly with budget. Use with caution; platform-level variance and diminishing returns are not modeled.
          </div>
        </div>
      </div>
    </div>
  );
}

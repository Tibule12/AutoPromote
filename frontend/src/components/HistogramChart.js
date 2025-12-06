import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export default function HistogramChart({ samples = [], bins = 10 }) {
  if (!samples || !samples.length) return null;

  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const width = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  const labels = new Array(bins).fill(0).map((_, i) => {
    const lo = min + i * width;
    const hi = lo + width;
    return `${(lo * 100).toFixed(2)}%–${(hi * 100).toFixed(2)}%`;
  });

  for (const s of samples) {
    let idx = Math.floor((s - min) / width);
    if (idx < 0) idx = 0;
    if (idx >= bins) idx = bins - 1;
    counts[idx]++;
  }

  const data = counts.map((c, i) => ({ bin: labels[i], count: c }));

  return (
    <div style={{ width: '100%', height: 120 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
          <XAxis dataKey="bin" hide={true} />
          <YAxis hide={true} />
          <Tooltip formatter={(value) => [value, 'Count']} />
          <Bar dataKey="count" fill="#1976d2" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

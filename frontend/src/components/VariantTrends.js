import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ReferenceDot } from 'recharts';

export default function VariantTrends({ data = [], variants = [], actions = [], metric = 'views' }) {
  if (!data || !data.length) return <div style={{ padding: 12, color: '#666' }}>No trend data available.</div>;

  const lines = variants.map((v, idx) => ({ key: v, color: ['#1976d2', '#2e7d32', '#ed6c02', '#7b1fa2'][idx % 4] }));

  return (
    <div style={{ background: 'white', borderRadius: 12, padding: 16, boxShadow: '0 6px 20px rgba(0,0,0,0.06)' }}>
      <h3 style={{ marginTop: 0 }}>Variant Trends (last {data.length} days)</h3>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip formatter={(value) => [value, metric]} />
            <Legend />
            {lines.map((l) => (
              <Line key={l.key} type="monotone" dataKey={`${l.key}_${metric}`} stroke={l.color} dot={false} strokeWidth={2} />
            ))}
            {/* Autopilot actions: one ReferenceDot per action (show a simple vertical dot) */}
            {actions.map((a, i) => {
              const dayKey = new Date(a.triggeredAt && a.triggeredAt.toDate ? a.triggeredAt.toDate() : a.triggeredAt).toISOString().split('T')[0];
              return <ReferenceDot key={i} x={dayKey} y={0} r={4} fill="#d32f2f" stroke="none" />;
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ marginTop: 10, color: '#666', display: 'flex', gap: 14 }}>
        {variants.map((v, i) => <div key={v}><span style={{ color: lines[i].color, fontWeight: 600 }}>{v}</span></div>)}
      </div>
    </div>
  );
}

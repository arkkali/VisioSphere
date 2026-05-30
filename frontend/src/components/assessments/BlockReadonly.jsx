import React from 'react';
import { Box, Typography, Checkbox, Button } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ChartPreview = ({ content, isDark }) => {
  if (!content.dataPoints || content.dataPoints.length === 0) return null;
  return (
    <Box sx={{ mt: 3, pt: 3, borderTop: `1px dashed ${isDark ? '#334155' : '#e2e8f0'}` }}>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={content.dataPoints} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#e2e8f0'} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: isDark ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: isDark ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
              backgroundColor: isDark ? '#1e293b' : '#fff',
              color: isDark ? '#fff' : '#000',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#00a8e8"
            strokeWidth={3}
            dot={{ r: 5, fill: '#00a8e8', strokeWidth: 2, stroke: isDark ? '#1e293b' : 'white' }}
            activeDot={{ r: 7 }}
            name={content.chartType === 'temperature' ? 'Temp (°C)' : content.chartType === 'vitals' ? 'Rate' : 'Value'}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
};

const BlockReadonly = ({ block, isDark }) => {
  switch (block.type) {
    case 'text':
      return (
        <Box
          className="quill-readonly-content"
          sx={{
            color: isDark ? '#cbd5e1' : '#475569',
            fontSize: '14px',
            lineHeight: 1.6,
            '& h1, & h2, & h3': { color: isDark ? '#fff' : '#0f172a', mt: 1, mb: 1 },
            '& ul, & ol': { paddingLeft: '20px', margin: 0 },
            '& p': { margin: 0, padding: 0 },
            '& img': { maxWidth: '100%', height: 'auto', borderRadius: '8px' },
          }}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      );

    case 'checklist':
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {Array.isArray(block.content) && block.content.map((item, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center' }}>
              <Checkbox
                checked={item.checked}
                disableRipple
                sx={{ p: 0.5, pr: 1, color: '#00a8e8', '&.Mui-checked': { color: '#00a8e8' } }}
                readOnly
              />
              <Typography sx={{
                fontSize: '14px',
                color: item.checked ? (isDark ? '#475569' : '#94a3b8') : (isDark ? '#cbd5e1' : '#334155'),
                textDecoration: item.checked ? 'line-through' : 'none',
              }}>
                {item.text}
              </Typography>
            </Box>
          ))}
        </Box>
      );

    case 'chart':
      return <ChartPreview content={block.content} isDark={isDark} />;

    case 'image':
      return block.fileUrl
        ? <Box component="img" src={block.fileUrl} alt="Attachment" sx={{ maxWidth: '100%', borderRadius: 2, mt: 1, border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}` }} />
        : null;

    case 'file':
      return block.fileUrl
        ? (
          <Button
            variant="contained"
            href={block.fileUrl}
            target="_blank"
            rel="noreferrer"
            sx={{
              bgcolor: isDark ? 'rgba(2, 132, 199, 0.2)' : '#f0f9ff',
              color: isDark ? '#38bdf8' : '#00a8e8',
              boxShadow: 'none',
              '&:hover': { bgcolor: isDark ? 'rgba(2, 132, 199, 0.3)' : '#e0f2fe', boxShadow: 'none' },
              textTransform: 'none',
              fontWeight: 700,
            }}
          >
            Download Attached File
          </Button>
        )
        : null;

    default:
      return null;
  }
};

export default BlockReadonly;
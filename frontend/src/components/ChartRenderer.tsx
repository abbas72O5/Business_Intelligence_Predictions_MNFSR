import React from 'react';
import Plot from 'react-plotly.js';

export interface ChartConfig {
  id: string;
  selectedDataset: any;
  chartType: string;
  xColumn: string;
  yColumn: string;
  latColumn: string;
  lonColumn: string;
  valColumn: string;
  labelColumn: string;
  mapType: string;
  tableColumns: string[];
  xAxisProps: { label: string; type: string };
  yAxisProps: { label: string; type: string };
  groupBy: boolean;
  groupAxis?: 'x' | 'y';
  aggregation: string;
  chartData: any;
  width: number;
  height: number;
  x: number;
  y: number;
}

interface ChartRendererProps {
  chart: ChartConfig;
  className?: string;
  overrideWidth?: string | number;
  overrideHeight?: string | number;
}

export default function ChartRenderer({ chart, className, overrideWidth, overrideHeight }: ChartRendererProps) {
  if (!chart.chartData || chart.chartData.length === 0) return null;

  const w = overrideWidth !== undefined ? overrideWidth : `${chart.width}px`;
  const h = overrideHeight !== undefined ? overrideHeight : `${chart.height}px`;

  // --- MAP LOGIC ---
  if (chart.chartType === 'map') {
    const valName = chart.valColumn || 'Value';
    
    if (chart.chartData[0].map_html) {
      return (
        <div style={{ width: w, height: h, position: 'relative' }} className={className}>
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-white px-3 py-1 rounded shadow text-sm font-semibold z-[1000] pointer-events-none">
            {chart.mapType === 'heat' ? 'Heat Map' : 'Bubble Map'} of {valName}
          </div>
          <iframe
            title={`map-${chart.id}`}
            srcDoc={chart.chartData[0].map_html}
            style={{ width: '100%', height: '100%', border: 'none' }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      );
    }
    return <div className={`flex items-center justify-center h-full text-gray-400 ${className}`}>Loading Map...</div>;
  }

  // --- PLOTLY / TABLE LOGIC ---
  const xValues = chart.chartData.map((d: any) => d[chart.xColumn]);
  const yValues = chart.chartData.map((d: any) => d[chart.yColumn]);

  let data: any[] = [];
  let layoutAdditions: any = {};

  if (chart.chartType === 'bar') {
    data = [{ type: 'bar', x: xValues, y: yValues, marker: { color: '#16a34a' } }];
  } else if (chart.chartType === 'line') {
    data = [{ type: 'scatter', mode: 'lines+markers', x: xValues, y: yValues, line: { color: '#16a34a' } }];
  } else if (chart.chartType === 'scatter') {
    data = [{ type: 'scatter', mode: 'markers', x: xValues, y: yValues, marker: { size: 10, color: '#16a34a' } }];
  } else if (chart.chartType === 'pie') {
    data = [{ type: 'pie', labels: xValues, values: yValues.map(Number) }];
  } else if (chart.chartType === 'table') {
    const columns = Object.keys(chart.chartData[0] || {});
    data = [{
      type: 'table',
      header: {
        values: columns,
        align: "center",
        fill: { color: "#f3f4f6" },
        font: { family: "Inter, sans-serif", size: 14, color: "#374151" }
      },
      cells: {
        values: columns.map(c => chart.chartData.map((d: any) => d[c])),
        align: "center",
        fill: { color: "#ffffff" },
        font: { family: "Inter, sans-serif", size: 12, color: "#4b5563" }
      }
    }];
  } else if (chart.chartType === 'heatmap') {
    data = [{ type: 'histogram2d', x: xValues, y: yValues, colorscale: 'Greens' }];
  } else if (chart.chartType === 'treemap') {
    const uniqueLabels = xValues.map((val: any, idx: number) => {
        const strVal = String(val);
        return xValues.indexOf(val) === idx ? strVal : `${strVal} (${idx})`;
    });
    data = [{
      type: 'treemap',
      labels: uniqueLabels,
      parents: Array(xValues.length).fill(""),
      values: yValues.map(Number),
      textinfo: "label+value+percent parent"
    }];
  }

  const actualXLabel = chart.xAxisProps?.label || chart.xColumn || '';
  const actualYLabel = chart.yAxisProps?.label || chart.yColumn || '';

  let chartTitle = `${chart.selectedDataset?.data?.filename || chart.selectedDataset?.data?.name || 'Chart'}`;
  if (chart.chartType !== 'table') {
      chartTitle += ` - ${chart.groupBy ? `${chart.aggregation}(${actualYLabel})` : actualYLabel} by ${actualXLabel}`;
  }

  let chartLayout: any = {
    title: chartTitle,
    width: overrideWidth ? undefined : chart.width,
    height: overrideHeight ? undefined : chart.height,
    autosize: overrideWidth || overrideHeight ? true : false,
    margin: { l: 50, r: 50, b: 80, t: 50, pad: 4 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    dragmode: 'pan',
    modebar: {
      orientation: 'h',
      bgcolor: '#ffffff',
      color: '#16a34a',
      activecolor: '#15803d'
    },
    ...layoutAdditions
  };

  if (['bar', 'line', 'scatter', 'heatmap'].includes(chart.chartType)) {
    if (chart.groupBy && chart.groupAxis === 'y') {
      chartLayout.yaxis = {
        title: { text: actualYLabel },
        automargin: true,
        ...(chart.yAxisProps?.type === 'Integer' ? { tickformat: 'd' } : {})
      };
      chartLayout.xaxis = {
        title: { text: `${chart.aggregation}(${actualXLabel})` },
        automargin: true,
        ...(chart.xAxisProps?.type === 'Integer' ? { tickformat: 'd' } : {})
      };
    } else {
      chartLayout.yaxis = {
        title: { text: chart.groupBy ? `${chart.aggregation}(${actualYLabel})` : actualYLabel },
        automargin: true,
        ...(chart.yAxisProps?.type === 'Integer' ? { tickformat: 'd' } : {})
      };
      chartLayout.xaxis = {
        title: { text: actualXLabel },
        automargin: true,
        ...(chart.xAxisProps?.type === 'Integer' ? { tickformat: 'd' } : {})
      };
    }
  }

  return (
    <div className={className} style={{ width: w, height: h }}>
      <Plot
        key={`${chart.id}-${chart.chartType}-${chart.chartData ? chart.chartData.length : 0}`}
        data={data}
        layout={chartLayout}
        config={{
          displayModeBar: true,
          scrollZoom: true,
          displaylogo: false,
          responsive: true,
          modeBarButtonsToAdd: chart.chartType === 'map' ? undefined : ['pan2d', 'zoom2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d']
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

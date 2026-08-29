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
  colorColumn?: string;
  sizeColumn?: string;
  labelColumn: string;
  mapType: string;
  tableColumns: string[];
  xAxisProps: { label: string; type: string };
  yAxisProps: { label: string; type: string };
  groupBy: boolean;
  groupAxis?: 'x' | 'y';
  aggregation: string;
  matrixMode?: 'grid' | 'heatmap';
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
  
  const hasForecast = chart.chartData.some((d: any) => d._is_forecast);
  const colors = chart.chartData.map((d: any) => d._is_forecast ? '#f59e0b' : '#16a34a');

  let data: any[] = [];
  let layoutAdditions: any = {};

  if (chart.chartType === 'bar') {
    data = [{ type: 'bar', x: xValues, y: yValues, marker: { color: hasForecast ? colors : '#16a34a' } }];
  } else if (chart.chartType === 'line') {
    if (hasForecast) {
      const histX = chart.chartData.filter((d: any) => !d._is_forecast).map((d: any) => d[chart.xColumn]);
      const histY = chart.chartData.filter((d: any) => !d._is_forecast).map((d: any) => d[chart.yColumn]);
      const predX = chart.chartData.filter((d: any) => d._is_forecast).map((d: any) => d[chart.xColumn]);
      const predY = chart.chartData.filter((d: any) => d._is_forecast).map((d: any) => d[chart.yColumn]);
      
      const lastHistX = histX[histX.length - 1];
      const lastHistY = histY[histY.length - 1];
      
      data = [
        { type: 'scatter', mode: 'lines+markers', x: histX, y: histY, name: 'Historical', line: { color: '#16a34a' } },
        { type: 'scatter', mode: 'lines', x: [lastHistX, ...predX], y: [lastHistY, ...predY], name: 'Predicted', line: { color: '#f59e0b', dash: 'dot' } }
      ];
    } else {
      data = [{ type: 'scatter', mode: 'lines+markers', x: xValues, y: yValues, line: { color: '#16a34a' } }];
    }
  } else if (chart.chartType === 'scatter') {
    const colorVals = chart.colorColumn ? chart.chartData.map((d: any) => d[chart.colorColumn]) : undefined;
    const sizeVals = chart.sizeColumn ? chart.chartData.map((d: any) => Math.abs(Number(d[chart.sizeColumn]))) : 10;
    
    // Auto-scale bubble sizes to look reasonable (e.g. max size 40px)
    let markerSize = sizeVals;
    if (chart.sizeColumn && sizeVals.length > 0) {
      const maxVal = Math.max(...(sizeVals as number[]));
      markerSize = maxVal > 0 ? (sizeVals as number[]).map(v => Math.max(5, (v / maxVal) * 40)) : 10;
    }

    data = [{ 
      type: 'scatter', 
      mode: 'markers', 
      x: xValues, 
      y: yValues, 
      marker: { 
        size: markerSize, 
        color: hasForecast && !chart.colorColumn ? colors : colorVals,
        colorscale: 'Viridis',
        showscale: !!chart.colorColumn
      } 
    }];
  } else if (chart.chartType === 'pie') {
    const pieTrace: any = { 
      type: 'pie', 
      labels: xValues, 
      values: yValues.map((v: any) => Math.max(0, Number(v))) 
    };
    if (hasForecast) {
      pieTrace.marker = { colors: colors };
    }
    data = [pieTrace];
  } else if (chart.chartType === 'table' || (chart.chartType === 'heatmap' && chart.matrixMode !== 'heatmap')) {
    let columns = Object.keys(chart.chartData[0] || {});
    if (chart.chartType === 'heatmap' && chart.yColumn && columns.includes(chart.yColumn)) {
        columns = [chart.yColumn, ...columns.filter(c => c !== chart.yColumn)];
    }
    data = [{
      type: 'table',
      header: {
        values: columns,
        align: "center",
        fill: { color: "#f3f4f6" },
        font: { family: "Inter, sans-serif", size: 14, color: "#374151" }
      },
      cells: {
        values: columns.map(c => chart.chartData.map((d: any) => {
          let val = d[c];
          return typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(2)) : val;
        })),
        align: "center",
        fill: { color: "#ffffff" },
        font: { family: "Inter, sans-serif", size: 12, color: "#4b5563" }
      }
    }];
  } else if (chart.chartType === 'heatmap' && chart.matrixMode === 'heatmap') {
    let columns = Object.keys(chart.chartData[0] || {});
    if (chart.yColumn && columns.includes(chart.yColumn)) {
        columns = [chart.yColumn, ...columns.filter(c => c !== chart.yColumn)];
    }
    const xLabels = columns.slice(1);
    const yLabels = chart.chartData.map((row: any) => row[columns[0]]);
    const zData = chart.chartData.map((row: any) => xLabels.map(col => row[col] === null ? null : Number(row[col])));
    
    data = [{
      type: 'heatmap',
      x: xLabels,
      y: yLabels,
      z: zData,
      colorscale: 'Greens',
      texttemplate: "%{z}"
    }];
  } else if (chart.chartType === 'treemap') {
    // If colorColumn (Sub-Category) is provided, build a 2-level hierarchy
    if (chart.colorColumn) {
      const mainCats = chart.chartData.map((d: any) => String(d[chart.xColumn]));
      const subCats = chart.chartData.map((d: any) => String(d[chart.colorColumn]));
      const sizes = chart.chartData.map((d: any) => Number(d[chart.yColumn]));

      // Aggregate sizes by Main Category and Main+Sub Category
      const rootMap = new Map<string, number>();
      const subMap = new Map<string, number>();

      for (let i = 0; i < mainCats.length; i++) {
        const m = mainCats[i] || 'Unknown';
        const s = subCats[i] || 'Unknown';
        const v = sizes[i] || 0;
        
        rootMap.set(m, (rootMap.get(m) || 0) + v);
        const subKey = `${m} - ${s}`;
        subMap.set(subKey, (subMap.get(subKey) || 0) + v);
      }

      const labels: string[] = [];
      const parents: string[] = [];
      const treeValues: number[] = [];

      // Add roots
      for (const [m, v] of rootMap.entries()) {
        labels.push(m);
        parents.push("");
        treeValues.push(v);
      }

      // Add leaves
      for (const [subKey, v] of subMap.entries()) {
        const [m, s] = subKey.split(' - ');
        labels.push(s + " (" + m + ")"); // Ensure uniqueness
        parents.push(m);
        treeValues.push(v);
      }

      data = [{
        type: 'treemap',
        labels: labels,
        parents: parents,
        values: treeValues,
        textinfo: "label+value+percent parent",
        branchvalues: "total"
      }];
    } else {
      // Single level treemap (legacy behavior)
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
  }

  const actualXLabel = chart.xAxisProps?.label || chart.xColumn || '';
  const actualYLabel = chart.yAxisProps?.label || chart.yColumn || '';

  let chartTitle = `${chart.selectedDataset?.data?.filename || chart.selectedDataset?.data?.name || 'Chart'}`;
  if (chart.chartType !== 'table' && chart.chartType !== 'heatmap') {
      chartTitle += ` - ${chart.groupBy ? `${chart.aggregation}(${actualYLabel})` : actualYLabel} by ${actualXLabel}`;
  } else if (chart.chartType === 'heatmap') {
      chartTitle += ` - Matrix: ${actualYLabel} (Rows) vs ${actualXLabel} (Columns)`;
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

  if (['bar', 'line', 'scatter'].includes(chart.chartType)) {
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
        title: { text: chart.groupBy && chart.chartType !== 'heatmap' ? `${chart.aggregation}(${actualYLabel})` : actualYLabel },
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

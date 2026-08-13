import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Database, LayoutList } from 'lucide-react';

export default function TableNode({ data, id }: NodeProps) {
  // data contains: filename, columns (name, type), selectedColumns (Set), onToggleColumn
  
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-300 w-64 overflow-hidden font-sans">
      <div className="bg-green-800 text-white px-4 py-3 flex items-center justify-between cursor-move">
        <div className="flex items-center space-x-2 overflow-hidden">
          <Database className="h-4 w-4 flex-shrink-0" />
          <span className="font-bold text-sm truncate">{data.filename}</span>
        </div>
      </div>
      
      <div className="p-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center text-xs text-gray-500 font-semibold uppercase tracking-wider">
          <LayoutList className="h-3 w-3 mr-1" />
          Columns
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto p-2 space-y-1">
        {data.columns.map((col: any) => {
          const isSelected = data.selectedColumns?.has(col.name);
          return (
            <div key={col.name} className="flex items-center justify-between px-2 py-1.5 hover:bg-green-50 rounded-md transition-colors group">
              <div className="flex items-center space-x-2 overflow-hidden">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => data.onToggleColumn(id, data.table_id, col.name, col.type, e.target.checked)}
                  className="rounded text-green-600 focus:ring-green-500 cursor-pointer"
                />
                <span className={`text-sm truncate ${isSelected ? 'font-medium text-gray-900' : 'text-gray-600'}`} title={col.name}>
                  {col.name}
                </span>
              </div>
              <select 
                value={col.type}
                onChange={(e) => data.onChangeColumnType && data.onChangeColumnType(id, data.table_id, col.name, e.target.value)}
                className="text-[10px] font-mono bg-gray-100 text-gray-500 px-1 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none appearance-none cursor-pointer"
              >
                <option value="String">String</option>
                <option value="Integer">Integer</option>
                <option value="Float">Float</option>
                <option value="Boolean">Boolean</option>
                <option value="Date">Date</option>
              </select>
              
              {/* Optional handles for future joins */}
              <Handle 
                type="source" 
                position={Position.Right} 
                id={`${col.name}-source`}
                style={{ top: 'auto', background: '#16a34a', border: 'none' }}
                className="!w-2 !h-2 opacity-0 group-hover:opacity-100 transition-opacity"
              />
              <Handle 
                type="target" 
                position={Position.Left} 
                id={`${col.name}-target`}
                style={{ top: 'auto', background: '#16a34a', border: 'none' }}
                className="!w-2 !h-2 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

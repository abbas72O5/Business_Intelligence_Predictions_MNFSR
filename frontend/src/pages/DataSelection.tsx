import { Database } from 'lucide-react';

export default function DataSelection() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Project Portfolio & Relationships</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center border-dashed border-2">
        <Database className="mx-auto h-16 w-16 text-gray-400 mb-4" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Wire up Project Data</h3>
        <p className="text-gray-500 max-w-lg mx-auto mb-6">
          Connect your uploaded data sources...
        </p>
        <button className="bg-green-800 text-white px-6 py-2.5 rounded-md font-medium hover:bg-green-900 transition-colors shadow-sm">
          Open Data Canvas
        </button>
      </div>
    </div>
  );
}

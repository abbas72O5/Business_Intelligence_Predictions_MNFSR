import { LineChart } from 'lucide-react';

export default function Observations() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Visual Observations</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center border-dashed border-2">
        <LineChart className="mx-auto h-16 w-16 text-gray-400 mb-4" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Build Interactive Reports</h3>
        <p className="text-gray-500 max-w-lg mx-auto mb-6">
          Create bar charts for Rupee vs Foreign Allocation, or line graphs for expenditure over time. These interactive reports can be saved to the Ministry Dashboard.
        </p>
        <button className="bg-green-800 text-white px-6 py-2.5 rounded-md font-medium hover:bg-green-900 transition-colors shadow-sm">
          Create New Chart
        </button>
      </div>
    </div>
  );
}

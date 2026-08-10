import { Brain } from 'lucide-react';

export default function Predictions() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">AI-Driven Budget Forecasting</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center border-dashed border-2">
        <Brain className="mx-auto h-16 w-16 text-gray-400 mb-4" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Predict Future Throw-forward</h3>
        <p className="text-gray-500 max-w-lg mx-auto mb-6">
          Use historical spending patterns to forecast budget requirements. The system will map confidence intervals (shaded clouds) and flag projects trending toward delays.
        </p>
        <button className="bg-green-800 text-white px-6 py-2.5 rounded-md font-medium hover:bg-green-900 transition-colors shadow-sm">
          Run Prophet Forecast
        </button>
      </div>
    </div>
  );
}

import { UploadCloud } from 'lucide-react';

export default function DataUpload() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Project Data Ingestion</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center border-dashed border-2">
        <UploadCloud className="mx-auto h-16 w-16 text-gray-400 mb-4" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Upload Project Sheets</h3>
        <p className="text-gray-500 max-w-lg mx-auto mb-6">
          Securely upload Excel or CSV files. You can choose to keep this data private for working purposes, or share it department-wide.
        </p>
        <button className="bg-green-800 text-white px-6 py-2.5 rounded-md font-medium hover:bg-green-900 transition-colors shadow-sm">
          Select File to Upload
        </button>
        <p className="text-xs text-gray-400 mt-4">Supported formats: .xlsx, .csv</p>
      </div>
    </div>
  );
}

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { UploadCloud, FileSpreadsheet, FileText, CheckCircle2, AlertCircle, Loader2, Trash2, AlertTriangle } from 'lucide-react';

export interface ColumnMetadata {
  name: string;
  type: string;
}

export interface TableMetadata {
  id: string;
  table_id: string;
  filename: string;
  columns: ColumnMetadata[];
  department: string;
  visibility: string;
  uploaded_at: string;
}

export default function DataUpload() {
  const { token } = useAuth();
  const [files, setFiles] = useState<TableMetadata[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedFile, setSelectedFile] = useState<TableMetadata | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{title: string, message: string, onConfirm: () => void} | null>(null);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await axios.get('http://localhost:8000/files/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFiles(res.data);
    } catch (err) {
      console.error("Failed to fetch files", err);
    }
  }, [token]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setError('');
    setSuccess('');

    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];

    if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
      setError('Only .csv and .xlsx files are supported.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post('http://localhost:8000/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });
      setSuccess(`${file.name} uploaded successfully!`);
      fetchFiles();
      
      // Log activity
      axios.post('http://localhost:8000/activities', {
        action: 'Upload Data',
        details: { dataset: file.name }
      }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An error occurred during upload.');
    } finally {
      setUploading(false);
    }
  }, [token, fetchFiles]);

  const deleteFile = (e: React.MouseEvent, tableId: string) => {
    e.stopPropagation();
    setConfirmAction({
      title: 'Delete File',
      message: 'Are you sure you want to permanently delete this table? This cannot be undone.',
      onConfirm: async () => {
        try {
          await axios.delete(`http://localhost:8000/files/${tableId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setFiles(files.filter(f => f.table_id !== tableId));
          if (selectedFile?.table_id === tableId) {
            setSelectedFile(null);
            setPreviewData([]);
          }
          setSuccess('File deleted successfully.');
          setTimeout(() => setSuccess(''), 3000);
          
          // Log activity
          const deletedFile = files.find(f => f.table_id === tableId);
          if (deletedFile) {
            axios.post('http://localhost:8000/activities', {
              action: 'Delete Data',
              details: { dataset: deletedFile.table_name }
            }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error(e));
          }
        } catch (err: any) {
          console.error('Failed to delete file', err);
          setError(err.response?.data?.detail || 'Failed to delete file.');
        } finally {
          setConfirmAction(null);
        }
      }
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    },
    multiple: false
  });

  const handleSelectFile = async (fileMeta: TableMetadata) => {
    setSelectedFile(fileMeta);
    setPreviewLoading(true);
    try {
      const res = await axios.get(`http://localhost:8000/files/${fileMeta.table_id}/preview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPreviewData(res.data);
    } catch (err) {
      console.error("Failed to fetch preview", err);
      setPreviewData([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Project Data Ingestion</h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">

        {/* Left Column: Upload Area & File Library */}
        <div className="w-full lg:w-1/3 flex flex-col gap-6">

          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`bg-white rounded-lg shadow-sm border p-8 text-center border-dashed border-2 cursor-pointer transition-colors ${isDragActive ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-400'
              }`}
          >
            <input {...getInputProps()} />
            {uploading ? (
              <Loader2 className="mx-auto h-12 w-12 text-green-600 animate-spin mb-4" />
            ) : (
              <UploadCloud className={`mx-auto h-12 w-12 mb-4 ${isDragActive ? 'text-green-500' : 'text-gray-400'}`} />
            )}
            <h3 className="text-lg font-bold text-gray-900 mb-2">Upload Project Sheets</h3>
            <p className="text-gray-500 text-sm mb-4">
              {isDragActive ? "Drop the file here..." : "Drag 'n' drop a CSV or Excel file here, or click to select."}
            </p>
            <button
              type="button"
              disabled={uploading}
              className="bg-green-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-900 transition-colors shadow-sm disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Browse Files'}
            </button>
            <p className="text-xs text-gray-400 mt-4">Supported formats: .xlsx, .csv</p>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-md border border-red-200 text-sm flex items-center">
              <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 text-green-700 p-3 rounded-md border border-green-200 text-sm flex items-center">
              <CheckCircle2 className="h-4 w-4 mr-2 flex-shrink-0" />
              {success}
            </div>
          )}

          {/* File Library Sidebar */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-sm">File Library</h3>
              <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-0.5 rounded-full">
                {files.length} Files
              </span>
            </div>
            <div className="overflow-y-auto p-2 space-y-1 flex-1">
              {files.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No files uploaded yet.</p>
              ) : (
                files.map((f) => (
                  <div key={f.table_id} className="relative group">
                    <button
                      onClick={() => handleSelectFile(f)}
                      className={`w-full text-left px-3 py-3 rounded-md flex items-center transition-colors ${selectedFile?.table_id === f.table_id
                          ? 'bg-green-50 border border-green-200'
                          : 'hover:bg-gray-50 border border-transparent'
                        }`}
                    >
                      {f.filename.endsWith('.csv') ? (
                        <FileText className="h-5 w-5 text-blue-500 mr-3 flex-shrink-0" />
                      ) : (
                        <FileSpreadsheet className="h-5 w-5 text-green-600 mr-3 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0 pr-6">
                        <p className="text-sm font-medium text-gray-900 truncate">{f.filename}</p>
                        <p className="text-xs text-gray-500">{new Date(f.uploaded_at).toLocaleDateString()}</p>
                      </div>
                    </button>
                    <button 
                      onClick={(e) => deleteFile(e, f.table_id)}
                      className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Delete Table"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Preview Area */}
        <div className="w-full lg:w-2/3 flex flex-col">
          {selectedFile ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">

              {/* File Info Header */}
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-bold text-gray-900">{selectedFile.filename}</h3>
                <p className="text-sm text-gray-500 mt-1">Uploaded on {new Date(selectedFile.uploaded_at).toLocaleString()}</p>
              </div>

              {/* Data Preview */}
              <div className="p-6 overflow-auto flex-1">
                <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4 border-b pb-2">
                  Data Preview (First 5 Rows)
                </h4>
                {previewLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 text-green-600 animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto shadow-sm ring-1 ring-black ring-opacity-5 sm:rounded-lg mb-8">
                    <table className="min-w-full divide-y divide-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          {selectedFile.columns.map((col) => (
                            <th key={col.name} scope="col" className="px-3 py-3.5 text-left text-xs font-semibold text-gray-900 whitespace-nowrap">
                              {col.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {previewData.map((row, idx) => (
                          <tr key={idx}>
                            {selectedFile.columns.map((col) => (
                              <td key={col.name} className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                {row[col.name] !== undefined && row[col.name] !== null ? String(row[col.name]) : ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {previewData.length === 0 && (
                          <tr>
                            <td colSpan={selectedFile.columns.length} className="px-3 py-8 text-center text-sm text-gray-500">
                              No data available.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Schema Metadata */}
                <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4 border-b pb-2">
                  Extracted Schema Metadata
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {selectedFile.columns.map((col) => (
                    <div key={col.name} className="bg-gray-50 border border-gray-200 rounded-md p-3">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Column</p>
                      <p className="text-sm font-bold text-gray-900 truncate mb-2" title={col.name}>{col.name}</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${col.type === 'Integer' || col.type === 'Float' ? 'bg-blue-100 text-blue-800' :
                          col.type === 'Date' ? 'bg-purple-100 text-purple-800' :
                            col.type === 'Boolean' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                        }`}>
                        {col.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 flex flex-col items-center justify-center p-12 text-center">
              <FileSpreadsheet className="h-16 w-16 text-gray-300 mb-4" />
              <h3 className="text-lg font-bold text-gray-900">No File Selected</h3>
              <p className="text-sm text-gray-500 mt-2 max-w-sm">
                Select a file from the library on the left to view its metadata schema and data preview.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{confirmAction.title}</h3>
              <p className="text-sm text-gray-500 mb-6">{confirmAction.message}</p>
              <div className="flex justify-end space-x-3">
                <button onClick={() => setConfirmAction(null)} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-bold">Cancel</button>
                <button onClick={confirmAction.onConfirm} className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md text-sm font-bold">
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Methodology
      </h1>
      
      <div className="space-y-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Content Coming Soon
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>This page is under construction. Detailed methodology documentation will be added in a future update.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Overview
          </h2>
          <p className="text-gray-700 mb-4">
            This section will contain detailed information about our power rating methodology, 
            implied line calculations, and betting edge identification algorithms.
          </p>

          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Planned Sections
          </h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Power Rating Algorithm</li>
            <li>Implied Line Calculations</li>
            <li>Market Line Analysis</li>
            <li>Edge Detection Methods</li>
            <li>Data Sources and Validation</li>
            <li>Model Performance Metrics</li>
          </ul>

          <div className="mt-8 p-4 bg-gray-100 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Note:</strong> This is a placeholder page. Content will be added in a separate task.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

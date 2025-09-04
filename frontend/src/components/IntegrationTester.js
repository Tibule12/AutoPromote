import React, { useState } from 'react';
import { 
  testFirestoreConnection,
  testRequiredCollections,
  testDatabaseSync,
  testAdminDashboardQueries,
  runAllTests
} from '../utils/testIntegration';

/**
 * Component for testing database and admin dashboard integration
 */
const IntegrationTester = () => {
  const [testResults, setTestResults] = useState({});
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  
  const runTest = async (testName, testFunction) => {
    setIsRunning(true);
    setError(null);
    
    try {
      console.log(`Running test: ${testName}`);
      const result = await testFunction();
      setTestResults(prev => ({
        ...prev,
        [testName]: { result, timestamp: new Date().toLocaleTimeString() }
      }));
      return result;
    } catch (err) {
      console.error(`Test ${testName} failed:`, err);
      setError(err.message);
      setTestResults(prev => ({
        ...prev,
        [testName]: { result: false, error: err.message, timestamp: new Date().toLocaleTimeString() }
      }));
      return false;
    } finally {
      setIsRunning(false);
    }
  };
  
  const runConnectionTest = () => runTest('connection', testFirestoreConnection);
  const runCollectionsTest = () => runTest('collections', testRequiredCollections);
  const runSyncTest = () => runTest('sync', testDatabaseSync);
  const runQueriesTest = () => runTest('queries', testAdminDashboardQueries);
  
  const runAllIntegrationTests = async () => {
    setIsRunning(true);
    setError(null);
    
    try {
      await runConnectionTest();
      await runCollectionsTest();
      await runSyncTest();
      await runQueriesTest();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };
  
  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '20px auto', 
      padding: '20px',
      backgroundColor: '#f9f9f9',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    }}>
      <h2 style={{ color: '#1976d2', marginTop: 0 }}>Database & Admin Dashboard Integration Tester</h2>
      
      {error && (
        <div style={{ 
          padding: '12px', 
          backgroundColor: '#ffebee', 
          color: '#d32f2f',
          borderRadius: '4px',
          marginBottom: '16px'
        }}>
          Error: {error}
        </div>
      )}
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={runAllIntegrationTests} 
          disabled={isRunning}
          style={{
            backgroundColor: '#1976d2',
            color: 'white',
            padding: '12px 20px',
            border: 'none',
            borderRadius: '4px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.7 : 1,
            fontWeight: 'bold',
            marginRight: '10px'
          }}
        >
          {isRunning ? 'Running Tests...' : 'Run All Tests'}
        </button>
        
        <button 
          onClick={runConnectionTest} 
          disabled={isRunning}
          style={{
            backgroundColor: '#4caf50',
            color: 'white',
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.7 : 1,
            marginRight: '8px'
          }}
        >
          Test Connection
        </button>
        
        <button 
          onClick={runCollectionsTest} 
          disabled={isRunning}
          style={{
            backgroundColor: '#ff9800',
            color: 'white',
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.7 : 1,
            marginRight: '8px'
          }}
        >
          Test Collections
        </button>
        
        <button 
          onClick={runSyncTest} 
          disabled={isRunning}
          style={{
            backgroundColor: '#9c27b0',
            color: 'white',
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.7 : 1,
            marginRight: '8px'
          }}
        >
          Test Sync
        </button>
        
        <button 
          onClick={runQueriesTest} 
          disabled={isRunning}
          style={{
            backgroundColor: '#2196f3',
            color: 'white',
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.7 : 1
          }}
        >
          Test Queries
        </button>
      </div>
      
      <div>
        <h3>Test Results:</h3>
        
        {Object.keys(testResults).length === 0 ? (
          <p>No tests have been run yet.</p>
        ) : (
          <div>
            {Object.entries(testResults).map(([test, { result, error, timestamp }]) => (
              <div 
                key={test}
                style={{ 
                  padding: '12px', 
                  margin: '8px 0', 
                  backgroundColor: typeof result === 'boolean' 
                    ? (result ? '#e8f5e9' : '#ffebee')
                    : '#e3f2fd',
                  borderRadius: '4px',
                  borderLeft: `4px solid ${typeof result === 'boolean' 
                    ? (result ? '#4caf50' : '#f44336')
                    : '#2196f3'}`
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  {test.charAt(0).toUpperCase() + test.slice(1)} Test: {' '}
                  {typeof result === 'boolean' 
                    ? (result ? '✅ PASSED' : '❌ FAILED')
                    : 'ℹ️ COMPLETED'}
                </div>
                
                {error && (
                  <div style={{ color: '#d32f2f', marginTop: '4px' }}>
                    Error: {error}
                  </div>
                )}
                
                {typeof result === 'object' && (
                  <pre style={{ 
                    backgroundColor: '#f5f5f5', 
                    padding: '8px', 
                    borderRadius: '4px',
                    overflow: 'auto',
                    fontSize: '0.85rem'
                  }}>
                    {JSON.stringify(result, null, 2)}
                  </pre>
                )}
                
                <div style={{ fontSize: '0.8rem', color: '#757575', marginTop: '4px' }}>
                  Run at: {timestamp}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IntegrationTester;

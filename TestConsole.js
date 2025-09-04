import React, { useState, useEffect } from 'react';
import { firestore } from './firebaseClient';
import './TestConsole.css';

const TestConsole = () => {
  const [testStatus, setTestStatus] = useState({
    connection: 'pending',
    collections: 'pending',
    queries: 'pending'
  });
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});

  const toggleSection = (section) => {
    setExpandedSections({
      ...expandedSections,
      [section]: !expandedSections[section]
    });
  };

  const testConnection = async () => {
    try {
      const testDoc = firestore.collection('_test_connection').doc('test');
      await testDoc.set({ timestamp: new Date() });
      await testDoc.delete();
      setTestStatus(prev => ({ ...prev, connection: 'passed' }));
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      setTestStatus(prev => ({ ...prev, connection: 'failed' }));
      setResults(prev => ({ ...prev, connectionError: error.message }));
      return false;
    }
  };

  const checkCollections = async () => {
    const requiredCollections = ['users', 'content', 'promotions', 'activities', 'analytics'];
    const collectionResults = { existing: [], missing: [] };
    
    try {
      const collections = await firestore.listCollections();
      const collectionIds = collections.map(col => col.id);
      
      for (const collection of requiredCollections) {
        if (collectionIds.includes(collection)) {
          collectionResults.existing.push(collection);
        } else {
          collectionResults.missing.push(collection);
        }
      }
      
      setResults(prev => ({ ...prev, collections: collectionResults }));
      setTestStatus(prev => ({ 
        ...prev, 
        collections: collectionResults.missing.length === 0 ? 'passed' : 'failed' 
      }));
      
      return collectionResults;
    } catch (error) {
      console.error('Error checking collections:', error);
      setResults(prev => ({ ...prev, collectionsError: error.message }));
      setTestStatus(prev => ({ ...prev, collections: 'failed' }));
      return { error: error.message };
    }
  };

  const testAdminQueries = async () => {
    const queryResults = { passed: [], failed: [] };
    
    const queries = [
      {
        name: 'Recent users',
        execute: () => firestore.collection('users')
          .orderBy('createdAt', 'desc')
          .limit(10)
          .get()
      },
      {
        name: 'Content metrics',
        execute: () => firestore.collection('content')
          .orderBy('views', 'desc')
          .limit(5)
          .get()
      },
      {
        name: 'Recent activities',
        execute: () => firestore.collection('activities')
          .orderBy('timestamp', 'desc')
          .limit(20)
          .get()
      },
      {
        name: 'Active promotions',
        execute: () => firestore.collection('promotions')
          .where('status', '==', 'active')
          .get()
      },
      {
        name: 'Analytics summary',
        execute: () => firestore.collection('analytics')
          .doc('summary')
          .get()
      }
    ];
    
    for (const query of queries) {
      try {
        const snapshot = await query.execute();
        queryResults.passed.push({
          name: query.name,
          count: snapshot.size || (snapshot.exists ? 1 : 0)
        });
      } catch (error) {
        queryResults.failed.push({
          name: query.name,
          error: error.message
        });
      }
    }
    
    setResults(prev => ({ ...prev, queries: queryResults }));
    setTestStatus(prev => ({ 
      ...prev, 
      queries: queryResults.failed.length === 0 ? 'passed' : 'failed' 
    }));
    
    return queryResults;
  };

  const runAllTests = async () => {
    setLoading(true);
    setTestStatus({
      connection: 'running',
      collections: 'pending',
      queries: 'pending'
    });
    
    try {
      const connectionSuccess = await testConnection();
      
      if (connectionSuccess) {
        setTestStatus(prev => ({ ...prev, collections: 'running' }));
        await checkCollections();
        
        setTestStatus(prev => ({ ...prev, queries: 'running' }));
        await testAdminQueries();
      }
    } catch (error) {
      console.error('Error running tests:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'passed': return '✅';
      case 'failed': return '❌';
      case 'running': return '⏳';
      default: return '⏱️';
    }
  };

  return (
    <div className="test-console">
      <h1>Database Integration Test Console</h1>
      
      <div className="test-controls">
        <button 
          onClick={runAllTests} 
          disabled={loading}
          className="test-button run-all"
        >
          {loading ? 'Running Tests...' : 'Run All Tests'}
        </button>
        
        <div className="test-status-summary">
          <div className={`test-status ${testStatus.connection}`}>
            {getStatusIcon(testStatus.connection)} Connection Test
          </div>
          <div className={`test-status ${testStatus.collections}`}>
            {getStatusIcon(testStatus.collections)} Collections Test
          </div>
          <div className={`test-status ${testStatus.queries}`}>
            {getStatusIcon(testStatus.queries)} Queries Test
          </div>
        </div>
      </div>
      
      <div className="test-results">
        {/* Connection Results */}
        <div className={`result-section ${testStatus.connection}`}>
          <div 
            className="section-header" 
            onClick={() => toggleSection('connection')}
          >
            <h2>Connection Test</h2>
            <span>{expandedSections.connection ? '▼' : '▶'}</span>
          </div>
          {expandedSections.connection && (
            <div className="section-content">
              {testStatus.connection === 'passed' && (
                <p>Successfully connected to Firestore.</p>
              )}
              {testStatus.connection === 'failed' && (
                <div className="error-message">
                  <p>Failed to connect to Firestore.</p>
                  <p>Error: {results.connectionError}</p>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Collections Results */}
        <div className={`result-section ${testStatus.collections}`}>
          <div 
            className="section-header" 
            onClick={() => toggleSection('collections')}
          >
            <h2>Collections Test</h2>
            <span>{expandedSections.collections ? '▼' : '▶'}</span>
          </div>
          {expandedSections.collections && results.collections && (
            <div className="section-content">
              <h3>Existing Collections:</h3>
              <ul className="collection-list">
                {results.collections.existing.map(col => (
                  <li key={col} className="collection-item existing">
                    ✅ {col}
                  </li>
                ))}
              </ul>
              
              {results.collections.missing.length > 0 && (
                <>
                  <h3>Missing Collections:</h3>
                  <ul className="collection-list">
                    {results.collections.missing.map(col => (
                      <li key={col} className="collection-item missing">
                        ❌ {col}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              
              {results.collectionsError && (
                <div className="error-message">
                  <p>Error checking collections: {results.collectionsError}</p>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Queries Results */}
        <div className={`result-section ${testStatus.queries}`}>
          <div 
            className="section-header" 
            onClick={() => toggleSection('queries')}
          >
            <h2>Queries Test</h2>
            <span>{expandedSections.queries ? '▼' : '▶'}</span>
          </div>
          {expandedSections.queries && results.queries && (
            <div className="section-content">
              <h3>Successful Queries:</h3>
              <ul className="query-list">
                {results.queries.passed.map((query, index) => (
                  <li key={index} className="query-item success">
                    ✅ {query.name} - Retrieved {query.count} documents
                  </li>
                ))}
              </ul>
              
              {results.queries.failed.length > 0 && (
                <>
                  <h3>Failed Queries:</h3>
                  <ul className="query-list">
                    {results.queries.failed.map((query, index) => (
                      <li key={index} className="query-item failed">
                        ❌ {query.name} - Error: {query.error}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="test-summary">
        <h2>Test Summary</h2>
        <p>
          {testStatus.connection === 'passed' && 
           testStatus.collections === 'passed' && 
           testStatus.queries === 'passed' ? (
            <span className="summary-success">✅ All tests passed! The database and admin dashboard are fully integrated.</span>
          ) : testStatus.connection === 'pending' ? (
            <span className="summary-pending">Run the tests to check integration status.</span>
          ) : (
            <span className="summary-failure">❌ Some tests failed. Check the details above.</span>
          )}
        </p>
      </div>
    </div>
  );
};

export default TestConsole;

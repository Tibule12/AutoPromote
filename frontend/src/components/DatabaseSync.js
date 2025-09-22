import React, { useEffect, useState } from 'react';
import DatabaseSyncService from '../utils/dbSchemaSync';

/**
 * Component that ensures database schema is aligned with admin dashboard requirements
 * This component doesn't render anything visible but performs the database checks
 * on mount and can be included in the main App component
 */

const DatabaseSync = ({ user }) => {
  const [syncStatus, setSyncStatus] = useState('pending');

  useEffect(() => {
    const performDatabaseSync = async () => {
      try {
        setSyncStatus('syncing');
        const result = await DatabaseSyncService.validateDatabaseSchema(user);
        setSyncStatus(result ? 'success' : 'error');
      } catch (error) {
        console.error('Database sync error:', error);
        setSyncStatus('error');
      }
    };
    performDatabaseSync();
  }, [user]);

  // This component doesn't render anything visible
  return null;
};

export default DatabaseSync;

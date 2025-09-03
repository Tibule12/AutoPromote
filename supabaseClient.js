// Firebase-based replacement for supabaseClient.js
// This is a compatibility layer to prevent import errors
const admin = require('firebase-admin');

// This creates a proxy object to intercept and handle any supabase method calls
// that might exist in legacy code
const firebaseProxy = new Proxy({}, {
  get: function(target, prop) {
    // Log any access to help debug what's being used
    console.log(`[Legacy Supabase] Accessing ${prop} via Firebase compatibility layer`);
    
    // Return a function that logs the call and returns an empty result
    return async (...args) => {
      console.log(`[Legacy Supabase] Called ${prop}`, args);
      // Return a default response structure similar to Supabase
      return { 
        data: null, 
        error: null 
      };
    };
  }
});

// Create a "from" method to handle common Supabase table queries
// Example: supabase.from('users').select('*')
firebaseProxy.from = (tableName) => {
  console.log(`[Legacy Supabase] Accessing table ${tableName} via Firebase compatibility layer`);
  
  return {
    select: async (fields) => {
      console.log(`[Legacy Supabase] Select ${fields} from ${tableName}`);
      // Return empty data array to prevent errors
      return { data: [], error: null };
    },
    insert: async (data) => {
      console.log(`[Legacy Supabase] Insert into ${tableName}`, data);
      return { data: null, error: null };
    },
    update: async (data) => {
      console.log(`[Legacy Supabase] Update ${tableName}`, data);
      return { data: null, error: null };
    },
    delete: async () => {
      console.log(`[Legacy Supabase] Delete from ${tableName}`);
      return { data: null, error: null };
    }
  };
};

module.exports = firebaseProxy;

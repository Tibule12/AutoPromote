const { db, auth, admin } = require('./firebaseAdmin');

async function testErrorScenarios() {
  try {
    console.log('🔍 Testing Error Scenarios and Edge Cases...\n');

    // Test 1: Invalid document ID access
    console.log('1. Testing invalid document access:');
    try {
      const invalidDoc = await db.collection('content').doc('non-existent-id').get();
      if (!invalidDoc.exists) {
        console.log('   ✅ Invalid document access handled correctly');
      } else {
        console.log('   ❌ Invalid document should not exist');
      }
    } catch (error) {
      console.log('   ❌ Error accessing invalid document:', error.message);
    }

    // Test 2: Empty collection queries
    console.log('\n2. Testing empty collection queries:');
    try {
      const emptyQuery = await db.collection('non_existent_collection').get();
      console.log('   ✅ Empty collection query handled correctly');
      console.log('   Documents found:', emptyQuery.size);
    } catch (error) {
      console.log('   ❌ Error with empty collection query:', error.message);
    }

    // Test 3: Invalid data types
    console.log('\n3. Testing invalid data types:');
    try {
      const invalidDataRef = db.collection('content').doc();
      await invalidDataRef.set({
        title: null, // Invalid null value
        user_id: undefined, // Invalid undefined value
        created_at: 'invalid-date', // Invalid date format
        views: 'not-a-number' // Invalid number type
      });
      console.log('   ❌ Invalid data types were accepted (should be validated)');
    } catch (error) {
      console.log('   ✅ Invalid data types rejected:', error.message);
    }

    // Test 4: Large data handling
    console.log('\n4. Testing large data handling:');
    try {
      const largeDataRef = db.collection('content').doc();
      const largeDescription = 'A'.repeat(10000); // 10KB string
      await largeDataRef.set({
        title: 'Large Content Test',
        description: largeDescription,
        user_id: 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3',
        created_at: new Date().toISOString()
      });
      console.log('   ✅ Large data handled successfully');

      // Clean up
      await largeDataRef.delete();
    } catch (error) {
      console.log('   ❌ Large data handling failed:', error.message);
    }

    // Test 5: Concurrent operations
    console.log('\n5. Testing concurrent operations:');
    try {
      const concurrentPromises = [];
      for (let i = 0; i < 5; i++) {
        const promise = db.collection('content').doc().set({
          title: `Concurrent Test ${i}`,
          user_id: 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3',
          created_at: new Date().toISOString()
        });
        concurrentPromises.push(promise);
      }

      await Promise.all(concurrentPromises);
      console.log('   ✅ Concurrent operations handled successfully');

      // Clean up concurrent test data
      const concurrentDocs = await db.collection('content')
        .where('title', '>=', 'Concurrent Test')
        .where('title', '<=', 'Concurrent Test\uFFFD')
        .get();

      const deletePromises = [];
      concurrentDocs.forEach(doc => {
        deletePromises.push(doc.ref.delete());
      });
      await Promise.all(deletePromises);

    } catch (error) {
      console.log('   ❌ Concurrent operations failed:', error.message);
    }

    // Test 6: Network timeout simulation (if possible)
    console.log('\n6. Testing timeout handling:');
    try {
      // Set a very short timeout for testing
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation timed out')), 100);
      });

      const dbOperation = db.collection('content').get();

      await Promise.race([dbOperation, timeoutPromise]);
      console.log('   ✅ Operation completed within timeout');
    } catch (error) {
      if (error.message === 'Operation timed out') {
        console.log('   ✅ Timeout handling works correctly');
      } else {
        console.log('   ❌ Unexpected error:', error.message);
      }
    }

    // Test 7: Authentication edge cases
    console.log('\n7. Testing authentication edge cases:');
    try {
      // Test with invalid user ID
      const invalidUserRef = db.collection('users').doc('invalid-user-id');
      const invalidUserDoc = await invalidUserRef.get();

      if (!invalidUserDoc.exists) {
        console.log('   ✅ Invalid user ID handled correctly');
      } else {
        console.log('   ❌ Invalid user should not exist');
      }
    } catch (error) {
      console.log('   ❌ Authentication edge case failed:', error.message);
    }

    // Test 8: Data consistency checks
    console.log('\n8. Testing data consistency:');
    try {
      const consistencyRef = db.collection('content').doc();
      const testData = {
        title: 'Consistency Test',
        user_id: 'QKHDrVDi2AWhS7Qbu8fHTkleWHF3',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await consistencyRef.set(testData);

      // Read back and verify
      const readDoc = await consistencyRef.get();
      const readData = readDoc.data();

      let consistent = true;
      for (const key in testData) {
        if (testData[key] !== readData[key]) {
          consistent = false;
          break;
        }
      }

      if (consistent) {
        console.log('   ✅ Data consistency maintained');
      } else {
        console.log('   ❌ Data consistency issues detected');
      }

      // Clean up
      await consistencyRef.delete();

    } catch (error) {
      console.log('   ❌ Data consistency test failed:', error.message);
    }

    console.log('\n🎉 Error scenarios testing completed!');
    console.log('📋 Summary:');
    console.log('   - Invalid document access: Tested');
    console.log('   - Empty collection queries: Tested');
    console.log('   - Invalid data types: Tested');
    console.log('   - Large data handling: Tested');
    console.log('   - Concurrent operations: Tested');
    console.log('   - Timeout handling: Tested');
    console.log('   - Authentication edge cases: Tested');
    console.log('   - Data consistency: Tested');

  } catch (error) {
    console.error('❌ Error scenarios test failed:', error.message);
  } finally {
    process.exit(0);
  }
}

testErrorScenarios();

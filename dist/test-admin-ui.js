// This script creates a very basic express server to test admin login
const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = 5002;

// Basic middleware
app.use(express.json());

// Test endpoint
app.get('/', (req, res) => {
  res.send(`
    <h1>Admin Endpoint Tester</h1>
    <form id="loginForm">
      <h2>Step 1: Login</h2>
      <div>
        <label>Email: </label>
        <input type="email" id="email" value="admin@autopromote.com" />
      </div>
      <div>
        <label>Password: </label>
        <input type="password" id="password" value="AdminPass123!" />
      </div>
      <button type="submit">Login</button>
      <div id="loginResult"></div>
    </form>
    
    <div id="endpointTester" style="display:none; margin-top: 20px;">
      <h2>Step 2: Test Endpoint</h2>
      <select id="endpoint">
        <option value="/api/admin/analytics/overview">Overview</option>
        <option value="/api/admin/analytics/users">Users</option>
        <option value="/api/admin/analytics/content">Content</option>
        <option value="/api/admin/analytics/platform-performance">Platform Performance</option>
        <option value="/api/admin/analytics/revenue-trends">Revenue Trends</option>
        <option value="/api/admin/analytics/promotion-performance">Promotion Performance</option>
      </select>
      <button id="testBtn">Test Endpoint</button>
      <div id="endpointResult"></div>
    </div>
    
    <script>
      let token = '';
      
      document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const resultDiv = document.getElementById('loginResult');
        
        resultDiv.innerHTML = 'Logging in...';
        
        try {
          const response = await fetch('http://localhost:5001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          
          const data = await response.json();
          
          if (data.token) {
            token = data.token;
            resultDiv.innerHTML = '<div style="color:green">Login successful!</div>';
            document.getElementById('endpointTester').style.display = 'block';
          } else {
            resultDiv.innerHTML = '<div style="color:red">Login failed: ' + (data.error || JSON.stringify(data)) + '</div>';
          }
        } catch (error) {
          resultDiv.innerHTML = '<div style="color:red">Error: ' + error.message + '</div>';
        }
      });
      
      document.getElementById('testBtn').addEventListener('click', async () => {
        const endpoint = document.getElementById('endpoint').value;
        const resultDiv = document.getElementById('endpointResult');
        
        resultDiv.innerHTML = 'Testing endpoint...';
        
        try {
          const response = await fetch('http://localhost:5001' + endpoint, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token }
          });
          
          const data = await response.json();
          const isMockData = data.isMockData ? '<div style="color:orange">(Mock Data)</div>' : '';
          
          resultDiv.innerHTML = 
            '<div style="color:' + (response.ok ? 'green' : 'red') + '">Status: ' + response.status + '</div>' + 
            isMockData +
            '<pre>' + JSON.stringify(data, null, 2).substring(0, 1000) + '...</pre>';
        } catch (error) {
          resultDiv.innerHTML = '<div style="color:red">Error: ' + error.message + '</div>';
        }
      });
    </script>
  `);
});

app.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}`);
});

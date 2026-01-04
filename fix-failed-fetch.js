// fix-failed-fetch.js
// Script to fix "Failed to fetch" error in AdminLoginForm.js

const fs = require("fs");
const path = require("path");

const adminLoginFormPath = path.join(__dirname, "frontend", "src", "AdminLoginForm.js");

// Read the AdminLoginForm.js file
fs.readFile(adminLoginFormPath, "utf8", (err, data) => {
  if (err) {
    console.error("Error reading AdminLoginForm.js:", err);
    return;
  }

  // Add additional error handling
  const fixedContent = data.replace(
    /const response = await fetch\(`\${apiUrl}\/api\/auth\/admin-login`,\s*\{([^}]*)\}\);/s,
    `try {
        const response = await fetch(\`\${apiUrl}/api/auth/admin-login\`, {$1});
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Invalid server response' }));
          console.error('Admin login server response:', {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          });
          throw new Error(errorData.error || 'Admin authentication failed');
        }

        const data = await response.json();
        
        // Verify this is actually an admin user
        if (!data.user.isAdmin && data.user.role !== 'admin') {
          throw new Error('Not authorized as admin');
        }
        
        // Pass user info to parent component
        onLogin({
          email: data.user.email,
          uid: data.user.uid,
          role: 'admin',
          isAdmin: true,
          name: data.user.name,
          token: data.token,
          fromCollection: data.user.fromCollection || 'admins'
        });
      } catch (fetchError) {
        console.error('API fetch error:', fetchError);
        throw new Error(\`Failed to connect to server: \${fetchError.message}\`);
      }`
  );

  // Update error handling
  const updatedContent = fixedContent.replace(
    /let errorMessage = 'Admin login failed. ';\s*switch \(error\.code\) {([^}]*)}/s,
    `let errorMessage = 'Admin login failed. ';
      
      if (error.message && error.message.includes('Failed to connect to server')) {
        errorMessage += 'Cannot connect to the server. Please ensure the backend server is running on port 5000.';
      } else {
        switch (error.code) {$1}`
  );

  const finalContent = updatedContent.replace(
    /default:\s*errorMessage \+= `\${error\.message} \(\${error\.code}\)`;/,
    `default:
            errorMessage += \`\${error.message}\`;
        }
      }`
  );

  // Write the updated content back to AdminLoginForm.js
  fs.writeFile(adminLoginFormPath, finalContent, "utf8", writeErr => {
    if (writeErr) {
      console.error("Error writing to AdminLoginForm.js:", writeErr);
      return;
    }
    console.log("✅ Updated AdminLoginForm.js with improved error handling");
  });
});

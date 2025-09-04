#!/bin/bash

# Test Content Upload with Enhanced Logging
# This script will test the content upload endpoint with detailed logging

echo "🔍 Testing Content Upload with Enhanced Logging"
echo "=============================================="
echo ""

# First, you need to get your Firebase ID token
echo "📋 STEP 1: Get your Firebase ID token"
echo "-------------------------------------"
echo "1. Login to your frontend application at http://localhost:3000"
echo "2. Open browser developer tools (F12)"
echo "3. Go to Application -> Local Storage"
echo "4. Find the firebase auth data"
echo "5. Copy the 'idToken' value"
echo ""
echo "Or run this command to check if you're logged in:"
echo "curl -X GET http://localhost:5000/api/auth/verify \\"
echo "  -H \"Authorization: Bearer YOUR_ID_TOKEN_HERE\""
echo ""

# Prompt for token
echo "Enter your Firebase ID token:"
read -s ID_TOKEN

if [ -z "$ID_TOKEN" ]; then
    echo "❌ No token provided. Exiting..."
    exit 1
fi

echo ""
echo "✅ Token received (length: ${#ID_TOKEN})"
echo ""

# Test the upload
echo "📤 STEP 2: Testing Content Upload"
echo "----------------------------------"

TIMESTAMP=$(date +%s)
CONTENT_DATA='{
  "title": "Debug Test Content - '$TIMESTAMP'",
  "type": "article",
  "url": "https://example.com/debug-test-'$TIMESTAMP'",
  "description": "This is a debug test content to check Firestore logging",
  "target_platforms": ["youtube", "tiktok"],
  "scheduled_promotion_time": null,
  "promotion_frequency": "once",
  "target_rpm": 100000,
  "min_views_threshold": 50000,
  "max_budget": 200
}'

echo "📝 Content data being sent:"
echo "$CONTENT_DATA" | jq . 2>/dev/null || echo "$CONTENT_DATA"
echo ""

echo "🚀 Making upload request..."
echo "Check the server logs for detailed Firestore write logging..."
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST http://localhost:5000/api/content/upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -d "$CONTENT_DATA")

# Extract status and body
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')

echo ""
echo "📊 RESPONSE:"
echo "Status: $HTTP_STATUS"
echo "Body:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"

if [ "$HTTP_STATUS" = "201" ]; then
    echo ""
    echo "🎉 SUCCESS! Content uploaded successfully!"
    echo "Check the server console for detailed Firestore logging."
    echo ""

    # Extract content ID if available
    CONTENT_ID=$(echo "$BODY" | jq -r '.content.id' 2>/dev/null)
    if [ "$CONTENT_ID" != "null" ] && [ -n "$CONTENT_ID" ]; then
        echo "Content ID: $CONTENT_ID"
    fi

    echo ""
    echo "📋 STEP 3: Verify Content in Firestore"
    echo "--------------------------------------"
    echo "Run this command to fetch your content:"
    echo "curl -X GET http://localhost:5000/api/content/my-content \\"
    echo "  -H \"Authorization: Bearer $ID_TOKEN\" | jq ."
else
    echo ""
    echo "❌ Upload failed!"
    echo "Check the server logs for detailed error information."
fi

echo ""
echo "🔍 Server logs should show:"
echo "- Content upload request received"
echo "- Preparing to save content to Firestore"
echo "- Content data to save (JSON)"
echo "- Firestore document ID"
echo "- Content successfully saved to Firestore"
echo "- Upload process completed successfully"

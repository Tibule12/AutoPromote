// add-connections-console.js
// Copy and paste this ENTIRE code into your browser console on the dashboard

const userId = "bf04dPKELvVMivWoUyLsAVyw2sg2";

async function addTestConnections() {
  try {
    console.log("🚀 Adding test platform connections...");

    // Get the auth token - try multiple approaches
    let token;

    // Try getting from user object in localStorage
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const userData = JSON.parse(userStr);
        token = userData.stsTokenManager?.accessToken || userData.accessToken;
      } catch (e) {
        console.log("Could not parse user data");
      }
    }

    // Fallback to other keys
    if (!token) {
      token =
        localStorage.getItem("authToken") ||
        localStorage.getItem("token") ||
        localStorage.getItem("firebaseToken");
    }

    // Last resort: try window.auth
    if (!token && window.auth && window.auth.currentUser) {
      token = await window.auth.currentUser.getIdToken();
    }

    if (!token) {
      console.error("❌ No auth token found. Please make sure you're logged in.");
      console.log("Available localStorage keys:", Object.keys(localStorage));
      return;
    }

    console.log("✅ Got auth token!");
    const apiUrl = "https://autopromote.onrender.com";

    const connections = [
      {
        platform: "facebook",
        data: {
          provider: "facebook",
          connected: true,
          obtainedAt: new Date().toISOString(),
          mode: "active",
          scope: "pages_manage_posts,pages_read_engagement",
          pages: [{ id: "test_page_123", name: "My Test Page", access_token: "test_token" }],
          identity: { id: "fb_user_123", name: "Test User" },
        },
      },
      {
        platform: "youtube",
        data: {
          provider: "youtube",
          connected: true,
          obtainedAt: new Date().toISOString(),
          mode: "active",
          scope: "youtube.upload,youtube.readonly",
          channel: { id: "test_channel_123", snippet: { title: "My YouTube Channel" } },
          identity: { id: "yt_user_123", email: "test@youtube.com" },
        },
      },
      {
        platform: "twitter",
        data: {
          provider: "twitter",
          connected: true,
          obtainedAt: new Date().toISOString(),
          mode: "active",
          scope: "tweet.read,tweet.write,users.read",
          identity: { id: "twitter_123", username: "testuser", name: "Test User" },
        },
      },
      {
        platform: "tiktok",
        data: {
          provider: "tiktok",
          connected: true,
          obtainedAt: new Date().toISOString(),
          mode: "active",
          scope: "video.upload,user.info.basic",
          display_name: "@testuser",
          identity: { open_id: "tiktok_123", display_name: "Test TikTok User" },
        },
      },
      {
        platform: "instagram",
        data: {
          provider: "instagram",
          connected: true,
          obtainedAt: new Date().toISOString(),
          mode: "active",
          scope: "instagram_basic,instagram_content_publish",
          identity: { id: "ig_123", username: "testuser" },
        },
      },
      {
        platform: "linkedin",
        data: {
          provider: "linkedin",
          connected: true,
          obtainedAt: new Date().toISOString(),
          mode: "active",
          scope: "w_member_social,r_liteprofile",
          meta: { organizations: [{ id: "org_123", name: "Test Company" }] },
          identity: { id: "li_123", firstName: "Test", lastName: "User" },
        },
      },
      {
        platform: "spotify",
        data: {
          provider: "spotify",
          connected: true,
          obtainedAt: new Date().toISOString(),
          mode: "active",
          scope: "playlist-modify-public,user-read-email",
          meta: {
            display_name: "Test Spotify User",
            playlists: [{ id: "playlist_123", name: "My Playlist" }],
          },
          identity: { id: "spotify_123", display_name: "Test Spotify User" },
        },
      },
      {
        platform: "reddit",
        data: {
          provider: "reddit",
          connected: true,
          obtainedAt: new Date().toISOString(),
          mode: "active",
          scope: "submit,read,identity",
          meta: { username: "testreddituser" },
          identity: { id: "reddit_123", name: "testreddituser" },
        },
      },
      {
        platform: "discord",
        data: {
          provider: "discord",
          connected: true,
          obtainedAt: new Date().toISOString(),
          mode: "active",
          scope: "bot,messages.write",
          meta: { guilds: [{ id: "guild_123", name: "My Discord Server" }] },
          identity: { id: "discord_123", username: "testuser#1234" },
        },
      },
      {
        platform: "telegram",
        data: {
          provider: "telegram",
          connected: true,
          obtainedAt: new Date().toISOString(),
          mode: "active",
          scope: "bot",
          meta: { chatId: "123456789" },
          identity: { id: "tg_123", first_name: "Test", username: "testuser" },
        },
      },
      {
        platform: "pinterest",
        data: {
          provider: "pinterest",
          connected: true,
          obtainedAt: new Date().toISOString(),
          mode: "active",
          scope: "boards:read,pins:write",
          meta: { boards: [{ id: "board_123", name: "My Board" }] },
          identity: { id: "pin_123", username: "testuser" },
        },
      },
      {
        platform: "snapchat",
        data: {
          provider: "snapchat",
          connected: true,
          obtainedAt: new Date().toISOString(),
          mode: "active",
          scope: "snapchat-marketing-api",
          identity: { id: "snap_123", display_name: "Test Snapchat User" },
        },
      },
    ];

    // Add each connection using Firestore REST API
    const projectId = "autopromote-7fca6"; // Your Firebase project ID

    for (const conn of connections) {
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}/connections/${conn.platform}`;

      const response = await fetch(firestoreUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: convertToFirestoreFormat(conn.data),
        }),
      });

      if (response.ok) {
        console.log(`✅ Added ${conn.platform} connection`);
      } else {
        const error = await response.text();
        console.error(`❌ Failed to add ${conn.platform}:`, error);
      }
    }

    console.log("\n🎉 All test connections added! Refresh your dashboard Security Panel.");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// Helper to convert JS object to Firestore REST API format
function convertToFirestoreFormat(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = { stringValue: value };
    } else if (typeof value === "boolean") {
      result[key] = { booleanValue: value };
    } else if (typeof value === "number") {
      result[key] = { integerValue: value.toString() };
    } else if (Array.isArray(value)) {
      result[key] = {
        arrayValue: {
          values: value.map(item => ({ mapValue: { fields: convertToFirestoreFormat(item) } })),
        },
      };
    } else if (typeof value === "object" && value !== null) {
      result[key] = {
        mapValue: { fields: convertToFirestoreFormat(value) },
      };
    }
  }
  return result;
}

// Run the function
addTestConnections();

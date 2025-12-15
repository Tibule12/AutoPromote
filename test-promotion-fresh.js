const fetch = require("node-fetch");

const LOCAL_SERVER_URL = "http://localhost:5000";

async function testPromotion(contentId) {
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmODI2Y2NkNC00ZjAyLTQwYTgtYTBmYS1jOGQ5MGE1NmZiNzgiLCJlbWFpbCI6InRtdHNod2VsbzIxQGdtYWlsLmNvbSIsInJvbGUiOiJjcmVhdG9yIiwiaWF0IjoxNzU2NTUzMjM4LCJleHAiOjE3NTcxNTgwMzh9.-UuU4pXqVg_WhDiJDiCe3AcLREH7wxbaI2rLlXc3Yfg";

  try {
    const response = await fetch(`${LOCAL_SERVER_URL}/api/content/promote/${contentId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    console.log("Promotion response:", data);
  } catch (error) {
    console.error("Error during promotion test:", error);
  }
}

// Use the content ID from the added sample content
testPromotion("1f4bd668-7f08-4390-a5d7-36b256b7f777");

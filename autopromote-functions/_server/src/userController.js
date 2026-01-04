const { auth, db } = require("./firebaseClient");

// Generate JWT

// @desc    Register new user
// @route   POST /api/users/register
// @access  Public
const registerUser = async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });

    // Store user profile in Firestore
    await db
      .collection("users")
      .doc(userRecord.uid)
      .set({
        name,
        email,
        role: role || "creator",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    res.status(201).json({
      id: userRecord.uid,
      name,
      email,
      role: role || "creator",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Authenticate a user
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
  // Firebase Auth handles login on the client side (frontend)
  // Backend can verify ID tokens if needed
  res.status(501).json({ message: "Login is handled by Firebase Auth client SDK." });
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ id: userDoc.id, ...userDoc.data() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const userRef = db.collection("users").doc(req.user.uid);
    const currentSnap = await userRef.get();
    const currentData = currentSnap.exists ? currentSnap.data() : {};
    const updateData = {
      name: req.body.name,
      email: req.body.email,
      updated_at: new Date().toISOString(),
      // ...rest of code...
    };
    // Prevent downgrading admin role or isAdmin
    if (currentData.role === "admin" || currentData.isAdmin === true) {
      updateData.role = "admin";
      updateData.isAdmin = true;
    } else if (req.body.role) {
      updateData.role = req.body.role;
    }
    await userRef.update(updateData);
    res.json({ message: "Profile updated" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
};

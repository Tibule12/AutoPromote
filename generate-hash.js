const bcrypt = require("bcryptjs");
bcrypt.hash("Admin12345", 12).then(console.log);

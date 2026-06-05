const express = require("express");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const db = require("../db");
const { verifyToken, isAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(verifyToken, isAdmin);

// GET all users (no passwords)
router.get("/", async (req, res) => {
  try {
    const [users] = await db.query(
      "SELECT id, name, email, role FROM users ORDER BY id ASC"
    );
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET single user
router.get("/:id", async (req, res) => {
  try {
    const [users] = await db.query(
      "SELECT id, name, email, role FROM users WHERE id = ?",
      [req.params.id]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(users[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE user credentials
router.put(
  "/:id",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("role").notEmpty().withMessage("Role is required").isIn(["user", "admin"]).withMessage("Invalid role"),
    body("password").optional().isLength({ min: 6 }).withMessage("Password must be at least 6 characters")
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = parseInt(req.params.id, 10);
    const { name, email, role, password } = req.body;

    try {
      const [existing] = await db.query("SELECT id FROM users WHERE id = ?", [userId]);
      if (existing.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const [emailTaken] = await db.query(
        "SELECT id FROM users WHERE email = ? AND id != ?",
        [email, userId]
      );
      if (emailTaken.length > 0) {
        return res.status(400).json({ error: "Email already in use" });
      }

      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query(
          "UPDATE users SET name = ?, email = ?, role = ?, password = ? WHERE id = ?",
          [name, email, role, hashedPassword, userId]
        );
      } else {
        await db.query(
          "UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?",
          [name, email, role, userId]
        );
      }

      const [updated] = await db.query(
        "SELECT id, name, email, role FROM users WHERE id = ?",
        [userId]
      );
      res.json({ message: "User updated successfully", user: updated[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE user
router.delete("/:id", async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  if (userId === req.user.id) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }

  try {
    const [existing] = await db.query("SELECT id FROM users WHERE id = ?", [userId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await db.query("DELETE FROM expenses WHERE user_id = ?", [userId]);
    await db.query("DELETE FROM users WHERE id = ?", [userId]);

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

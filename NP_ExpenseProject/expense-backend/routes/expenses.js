const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken } = require("../middleware/auth");

router.use(verifyToken);

// GET expenses with pagination
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Get total count
    const [countResult] = await db.query(
      "SELECT COUNT(*) as total FROM expenses WHERE user_id = ?",
      [req.user.id]
    );
    const total = countResult[0].total;
    
    // Get paginated expenses
    const [rows] = await db.query(
      "SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC LIMIT ? OFFSET ?",
      [req.user.id, limit, offset]
    );
    
    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET single expense by ID
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM expenses WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: "Expense not found" });
    }
    
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST create new expense
router.post("/", async (req, res) => {
  const { title, amount, category, date, description } = req.body;
  
  if (!title || !amount || !category || !date) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  
  try {
    const [result] = await db.query(
      "INSERT INTO expenses (title, amount, category, date, description, user_id) VALUES (?, ?, ?, ?, ?, ?)",
      [title, amount, category, date, description || null, req.user.id]
    );
    
    const [newExpense] = await db.query("SELECT * FROM expenses WHERE id = ?", [result.insertId]);
    res.status(201).json(newExpense[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update expense
router.put("/:id", async (req, res) => {
  const { title, amount, category, date, description } = req.body;
  
  try {
    const [result] = await db.query(
      "UPDATE expenses SET title = ?, amount = ?, category = ?, date = ?, description = ? WHERE id = ? AND user_id = ?",
      [title, amount, category, date, description || null, req.params.id, req.user.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Expense not found" });
    }
    
    const [updatedExpense] = await db.query("SELECT * FROM expenses WHERE id = ?", [req.params.id]);
    res.json(updatedExpense[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE expense
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM expenses WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Expense not found" });
    }
    
    res.status(200).json({ message: "Expense deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const db = require("../db");
const { JWT_SECRET } = require("../middleware/auth");
const nodemailer = require("nodemailer");

const router = express.Router();
const otpStore = new Map();

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const createTransporter = () => {
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }
  return null;
};

const sendOtpEmail = async (email, otp) => {
  const configured = process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS;
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || `"Expense Tracker" <no-reply@localhost>`,
    to: email,
    subject: "Expense Tracker verification code",
    text: `Your verification code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your verification code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`
  };

  if (configured) {
    const transporter = createTransporter();
    const info = await transporter.sendMail(mailOptions);
    return { emailSent: true, previewUrl: nodemailer.getTestMessageUrl(info) };
  }

  const testAccount = await nodemailer.createTestAccount();
  const testTransporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass
    }
  });

  const info = await testTransporter.sendMail(mailOptions);
  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.warn(`OTP for ${email}: ${otp} (preview URL: ${previewUrl})`);

  return { emailSent: false, previewUrl };
};

const storeOtp = (email, otp) => {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  otpStore.set(email, { otp, expiresAt });
};

const clearOtp = (email) => otpStore.delete(email);

const validateOtp = (email, otp) => {
  const entry = otpStore.get(email);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) {
    otpStore.delete(email);
    return false;
  }
  return entry.otp === otp;
};

const sendPendingResponse = (email, emailSent = true, previewUrl = undefined) => ({
  message: emailSent
    ? "OTP sent to your email"
    : "OTP generated in server preview because SMTP is not configured",
  pending: true,
  email,
  emailSent,
  previewUrl
});

// Register User
router.post(
  "/register",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("role").notEmpty().withMessage("Role is required").isIn(["user", "admin"]).withMessage("Invalid role")
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, role } = req.body;

    try {
      const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
      if (existing.length > 0) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const [result] = await db.query(
        "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
        [name, email, hashedPassword, role]
      );

      const otp = generateOtp();
      storeOtp(email, otp);
      const { emailSent, previewUrl } = await sendOtpEmail(email, otp);

      res.status(201).json(sendPendingResponse(email, emailSent, previewUrl));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Login User
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required")
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const [users] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
      if (users.length === 0) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const user = users[0];
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const otp = generateOtp();
      storeOtp(user.email, otp);
      const { emailSent, previewUrl } = await sendOtpEmail(user.email, otp);

      res.json(sendPendingResponse(user.email, emailSent, previewUrl));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Verify OTP
router.post(
  "/verify-otp",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("otp").isLength({ min: 6, max: 6 }).withMessage("Valid OTP is required")
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp } = req.body;

    if (!validateOtp(email, otp)) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    try {
      const [users] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
      if (users.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = users[0];
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      clearOtp(email);

      res.json({
        message: "OTP verified successfully",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Resend OTP
router.post(
  "/resend-otp",
  [body("email").isEmail().withMessage("Valid email is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    try {
      const [users] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
      if (users.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const otp = generateOtp();
      storeOtp(email, otp);
      const { emailSent, previewUrl } = await sendOtpEmail(email, otp);

      res.json({
        message: emailSent
          ? "OTP resent to your email"
          : "OTP generated in server preview because SMTP is not configured",
        pending: true,
        email,
        emailSent,
        previewUrl
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;

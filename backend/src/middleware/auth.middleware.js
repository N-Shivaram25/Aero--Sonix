import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protectRoute = async (req, res, next) => {
  try {
    const token = req.cookies.jwt;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized - No token provided" });
    }

    if (!process.env.JWT_SECRET_KEY) {
      return res.status(500).json({ message: "Server misconfigured - JWT secret missing" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    if (!decoded) {
      return res.status(401).json({ message: "Unauthorized - Invalid token" });
    }

    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(401).json({ message: "Unauthorized - User not found" });
    }

    req.user = user;

    next();
  } catch (error) {
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Unauthorized - Invalid token" });
    }
    console.log("Error in protectRoute middleware", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies.jwt;
    if (!token) {
      req.user = null;
      return next();
    }

    if (!process.env.JWT_SECRET_KEY) {
      return res.status(500).json({ message: "Server misconfigured - JWT secret missing" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    } catch (e) {
      req.user = null;
      return next();
    }

    const user = await User.findById(decoded.userId).select("-password");
    req.user = user || null;
    return next();
  } catch (error) {
    console.log("Error in optionalAuth middleware", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

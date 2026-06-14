import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRoutes from "./routes/api";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(
  cors({
    origin: "*", // Adjust for production environments
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parser middleware
app.use(express.json());

// Bind API Routes
app.use("/api", apiRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error Handler:", err);
  res.status(500).json({ error: err.message || "An unexpected error occurred." });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

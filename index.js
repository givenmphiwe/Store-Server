const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

const reviewsFilePath = path.join(__dirname, "reviews.json");

// Helper function to read reviews from the file
const readReviews = () => {
  try {
    if (!fs.existsSync(reviewsFilePath)) {
      return {};
    }
    const data = fs.readFileSync(reviewsFilePath);
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading reviews file:", error);
    return {};
  }
};

// Helper function to write reviews to the file
const writeReviews = (reviews) => {
  try {
    fs.writeFileSync(reviewsFilePath, JSON.stringify(reviews, null, 2));
  } catch (error) {
    console.error("Error writing to reviews file:", error);
  }
};

// Endpoint to get reviews for a specific product
app.get("/reviews/:id", (req, res) => {
  try {
    const { id } = req.params;
    const reviews = readReviews();
    res.json(reviews[id] || []);
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// Endpoint to add a new review for a specific product
app.post("/reviews/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { text, ProductName, userName, starRating } = req.body;

    if (!starRating) {
      return res.status(400).json({ error: "Review text is required" });
    }

    const reviews = readReviews();
    const newReview = {
      userName,
      text,
      ProductName,
      starRating,
      date: new Date().toISOString(),
    };

    if (!reviews[id]) {
      reviews[id] = [];
    }
    reviews[id].push(newReview);
    writeReviews(reviews);
    res.status(201).json(newReview);
  } catch (error) {
    console.error("Error adding review:", error);
    res.status(500).json({ error: "Failed to add review" });
  }
});

// The payment of the product

const phrase = "MAPO-inter32";

const generateSignature = (data, passPhrase = null) => {
  let pfOutput = "";

  for (let key in data) {
    if (data.hasOwnProperty(key) && data[key] !== "") {
      pfOutput += `${key}=${encodeURIComponent(data[key].trim()).replace(
        /%20/g,
        "+"
      )}&`;
    }
  }

  let getString = pfOutput.slice(0, -1);
  if (passPhrase !== null) {
    getString += `&passphrase=${encodeURIComponent(phrase.trim()).replace(
      /%20/g,
      "+"
    )}`;
  }

  return crypto.createHash("md5").update(getString).digest("hex");
};

const getPaymentId = async (paymentString) => {
  try {
    const result = await axios.post(
      "https://www.payfast.co.za/onsite/process",
      paymentString
    );
    return result.data;
  } catch (error) {
    console.error("Error getting payment ID:", error);
    throw error;
  }
};

// Initialize HTTP server
const server = http.createServer(app);

// Initialize socket.io
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Listen for WebSocket connections
io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

app.post("/initiate-payment", async (req, res) => {
  try {
    const { productName, paymentTotal, email } = req.body;

    if (!productName || !paymentTotal || !email) {
      return res.status(400).json({ error: "All fields are required." });
    }
    const paymentData = {
      merchant_id: "14129123",
      merchant_key: "m5ut7hkmojz16",
      email_address: email.toString(),
      amount: paymentTotal.toString(),
      item_name: productName.toString(),
    };

    const signature = generateSignature(paymentData, phrase);
    paymentData.signature = signature;
    const paymentString = new URLSearchParams(paymentData).toString();
    const paymentId = await getPaymentId(paymentString);

    // Emit payment success event to WebSocket clients
    io.emit("paymentSuccess");

    res.json({ paymentId });
  } catch (error) {
    console.error("Error initiating payment:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

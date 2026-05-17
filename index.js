const express = require('express');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
dotenv.config();

// Get the MongoDB URI from the environment variables
const uri = process.env.MONGO_URI;

const app = express();
const port = process.env.PORT || 5000; // Defaults to 5000 if process.env.PORT is missing

// Middleware
app.use(cors());
app.use(express.json());

// Create a MongoClient instance
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();

    // Database initialized with the name 'medique'
    const db = client.db("medique");
    
    // Example collection reference placeholder (uncomment and rename when needed)
    // const mediqueCollection = db.collection("appointments");
     // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("Database connection error:", error);
  } finally {
    // Keeping connection open for incoming requests
  }
}
run().catch(console.dir);

// Root route to verify server status
app.get('/', (req, res) => {
    res.send('Medique Server is Running!');
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

const express = require('express');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
dotenv.config();

const uri = process.env.MONGO_URI;
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    const db = client.db("medique");
    const testCollection = db.collection("test_collection");

    //Tutor Feature Get Method
    app.get('/api/v1/available-tutors', async (req, res) => {
     
      try {
        const tutors = await testCollection.find({}).limit(6).toArray();
        res.status(200).json(tutors);
      }
      
      catch (error) {
        res.status(500).json({ message: "Failed to fetch tutors", error: error.message });
      }

    });


// add tutor POST method
app.post('/api/v1/tutors', async (req, res) => {
  try {
    const newTutor = req.body;

    // Optional Validation: Ensure vital fields are present before inserting
    if (!newTutor.name || !newTutor.photo || !newTutor.subject || !newTutor.hourlyFee) {
      return res.status(400).json({ message: "Missing required tutor profile fields." });
    }

    // Insert the object payload received from frontend directly into MongoDB
    const result = await testCollection.insertOne(newTutor);
    
    res.status(201).json({
      message: "Tutor profile created successfully!",
      insertedId: result.insertedId
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to store tutor profile", error: error.message });
  }
});


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("Database connection error:", error);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Medique Server is Running!');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});


// const express = require('express');
// const dotenv = require('dotenv');
// const { MongoClient, ServerApiVersion } = require('mongodb');
// const cors = require('cors');
// dotenv.config();

// // Get the MongoDB URI from the environment variables
// const uri = process.env.MONGO_URI;

// const app = express();
// const port = process.env.PORT || 5000; // Defaults to 5000 if process.env.PORT is missing

// // Middleware
// app.use(cors());
// app.use(express.json());

// // Create a MongoClient instance
// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   }
// });

// async function run() {
//   try {
//     // Connect the client to the server
//     await client.connect();

//     // Database initialized with the name 'medique'
//     const db = client.db("medique");
    
//     // Example collection reference placeholder (uncomment and rename when needed)
//     // const mediqueCollection = db.collection("appointments");
//      // Send a ping to confirm a successful connection

//   const testCollection = db.collection("test_collection");




//     await client.db("admin").command({ ping: 1 });
//     console.log("Pinged your deployment. You successfully connected to MongoDB!");
//   } catch (error) {
//     console.error("Database connection error:", error);
//   } finally {
//     // Keeping connection open for incoming requests
//   }
// }
// run().catch(console.dir);

// // Root route to verify server status
// app.get('/', (req, res) => {
//     res.send('Medique Server is Running!');
// });

// // Start the server
// app.listen(port, () => {
//     console.log(`Server is running on port ${port}`);
// });

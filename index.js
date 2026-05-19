const express = require('express');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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

// Database theke sob data niye asa get Method e
app.get('/api/v1/all-tutors', async (req, res) => {
  try {
    const allTutors = await testCollection.find({}).toArray();
    res.status(200).json(allTutors);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tutor data", error: error.message });
  }
});

// 1. GET API: Fetch detailed profile parameters for a specific tutor by ID
app.get('/api/v1/tutors/:id', async (req, res) => {
  try {
    const id = req.params.id;
    
    // Check if the passed ID is a valid 24-character hex string before querying MongoDB
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Tutor ID format." });
    }

    const query = { _id: new ObjectId(id) };
    const tutor = await testCollection.findOne(query);
    
    if (!tutor) {
      return res.status(404).json({ message: "Tutor profile not found." });
    }
    
    res.status(200).json(tutor);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tutor details", error: error.message });
  }
});

// 2. POST API: Process booking transactions with strict backend validation guards
app.post('/api/v1/bookings', async (req, res) => {
  try {
    const bookingData = req.body;
    const tutorId = bookingData.tutorId;

    if (!ObjectId.isValid(tutorId)) {
      return res.status(400).json({ message: "Invalid target Tutor ID parameter format." });
    }

    const tutorQuery = { _id: new ObjectId(tutorId) };
    const tutor = await testCollection.findOne(tutorQuery);

    if (!tutor) {
      return res.status(404).json({ message: "The selected tutor profile does not exist." });
    }

    // 🎯 Requirement Validation A: Total Slot Availability Guard Check
    const currentSlots = Number(tutor.totalSlot);
    if (currentSlots <= 0) {
      return res.status(400).json({ 
        message: "This session is fully booked. You can’t join at the moment." 
      });
    }

    // 🎯 Requirement Validation B: Session Start Date Restriction Guard Check
    const currentDate = new Date();
    const sessionStartDate = new Date(tutor.startDate);

    // Normalize timestamps to midnight for clean date-only mathematical evaluation comparisons
    currentDate.setHours(0, 0, 0, 0);
    sessionStartDate.setHours(0, 0, 0, 0);

    if (currentDate < sessionStartDate) {
      return res.status(400).json({ 
        message: "Booking is not available yet for this tutor." 
      });
    }

    // System automatically generates the Book Status field parameter
    const finalBookingPayload = {
      ...bookingData,
      bookStatus: "Confirmed",
      bookedAt: new Date()
    };

    // Store transaction logs into a dedicated separate database storage tier collection
    const bookingsCollection = client.db("medique").collection("bookings");
    const bookingResult = await bookingsCollection.insertOne(finalBookingPayload);

    // 🎯 Requirement: Automatically decrease the totalSlot value parameter by -1 atomically
    await testCollection.updateOne(tutorQuery, { $inc: { totalSlot: -1 } });

    res.status(201).json({ 
      message: "🎉 Booking completed successfully!", 
      insertedId: bookingResult.insertedId 
    });

  } catch (error) {
    res.status(500).json({ message: "Internal booking process operation failed", error: error.message });
  }
});

// Filter kora my tutor e get method
app.get('/api/v1/my-tutors', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ message: "User email query parameter is required." });
    }
    const query = { "createdBy.email": email };
    const result = await testCollection.find(query).toArray();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch your tutors directory", error: error.message });
  }
});

// My tutor data put
app.put('/api/v1/tutors/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;
    const filter = { _id: new ObjectId(id) };
    
    const updateDoc = {
      $set: {
        name: updatedData.name,
        photo: updatedData.photo,
        subject: updatedData.subject,
        hourlyFee: Number(updatedData.hourlyFee),
        availableDays: updatedData.availableDays,
        timeSlot: updatedData.timeSlot,
        totalSlot: Number(updatedData.totalSlot),
        startDate: updatedData.startDate,
        institution: updatedData.institution,
        experience: updatedData.experience,
        location: updatedData.location,
        teachingMode: updatedData.teachingMode,
      }
    };

    const result = await testCollection.updateOne(filter, updateDoc);
    res.status(200).json({ message: "Tutor entry updated successfully!", result });
  } catch (error) {
    res.status(500).json({ message: "Failed to update tutor record", error: error.message });
  }
});

// My Tutor theke delete
app.delete('/api/v1/tutors/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await testCollection.deleteOne(query);
    res.status(200).json({ message: "Tutor record deleted successfully!", result });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete tutor record", error: error.message });
  }
});


// 1=> GET API:specific student er Email onujayi Booking filter kore niye asa
app.get('/api/v1/my-bookings', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ message: "Student email parameter is required." });
    }
    const bookingsCollection = client.db("medique").collection("bookings");
    const query = { studentEmail: email };
    const result = await bookingsCollection.find(query).toArray();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch bookings record", error: error.message });
  }
});

// ২. PATCH API: Booking staus update kore cancel kora
app.patch('/api/v1/bookings/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { bookStatus } = req.body;
    const bookingsCollection = client.db("medique").collection("bookings");
    const filter = { _id: new ObjectId(id) };
    
    const updateDoc = {
      $set: { bookStatus: bookStatus }
    };

    const result = await bookingsCollection.updateOne(filter, updateDoc);
    res.status(200).json({ message: "Booking deployment updated successfully!", result });
  } catch (error) {
    res.status(500).json({ message: "Failed to update booking status", error: error.message });
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

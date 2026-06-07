const express = require('express');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
dotenv.config();

const uri = process.env.MONGO_URI;
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ১. বেসিক হোম রাউট (Vercel-এ প্রথম রিকোয়েস্ট হ্যান্ডেল করার জন্য সবার উপরে রাখা ভালো)
app.get('/', (req, res) => {
  res.status(200).send('🎉 Medique Server is Running Successfully!');
});

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log(payload);
    next();
  } catch (error) {
    return res.status(403).json({ message: "Forbidden" });
  }
};

async function run() {
  try {
    // Vercel-এ সার্ভারলেস ফাংশনের পারফরম্যান্স ঠিক রাখতে client.connect() কমেন্ট করে রাখা হলো
    // await client.connect();
    
    const db = client.db("medique");
    const testCollection = db.collection("test_collection");
    const bookingsCollection = db.collection("bookings");

    // Tutor Feature Get Method
    app.get('/api/v1/available-tutors', async (req, res) => {
      try {
        const tutors = await testCollection.find({}).limit(6).toArray();
        res.status(200).json(tutors);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch tutors", error: error.message });
      }
    });

    // add tutor POST method
    app.post('/api/v1/tutors', verifyToken, async (req, res) => {
      try {
        const newTutor = req.body;
        if (!newTutor.name || !newTutor.photo || !newTutor.subject || !newTutor.hourlyFee) {
          return res.status(400).json({ message: "Missing required tutor profile fields." });
        }
        const result = await testCollection.insertOne(newTutor);
        res.status(201).json({
          message: "Tutor profile created successfully!",
          insertedId: result.insertedId
        });
      } catch (error) {
        res.status(500).json({ message: "Failed to store tutor details", error: error.message });
      }
    });

    // Replace all-tutors get id for search and filter method
    app.get('/api/v1/all-tutors', async (req, res) => {
      try {
        const { search, startDate, endDate } = req.query;
        let query = {};
        if (search) {
          query.name = { $regex: search, $options: "i" };
        }
        if (startDate || endDate) {
          query.startDate = {};
          if (startDate) query.startDate.$gte = startDate;
          if (endDate) query.startDate.$lte = endDate;
        }
        const allTutors = await testCollection.find(query).toArray();
        res.status(200).json(allTutors);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch filtered tutors directory records.", error: error.message });
      }
    });

    // 1. GET API: Fetch detailed profile parameters for a specific tutor by ID
    app.get('/api/v1/tutors/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
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

    // 2. POST API: Process booking transactions
    app.post('/api/v1/bookings', verifyToken, async (req, res) => {
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

        const currentSlots = Number(tutor.totalSlot);
        if (currentSlots <= 0) {
          return res.status(400).json({ message: "This session is fully booked. You can’t join at the moment." });
        }

        const currentDate = new Date();
        const sessionStartDate = new Date(tutor.startDate);
        currentDate.setHours(0, 0, 0, 0);
        sessionStartDate.setHours(0, 0, 0, 0);

        if (currentDate < sessionStartDate) {
          return res.status(400).json({ message: "Booking is not available yet for this tutor." });
        }

        const finalBookingPayload = {
          ...bookingData,
          bookStatus: "Confirmed",
          bookedAt: new Date()
        };

        const bookingResult = await bookingsCollection.insertOne(finalBookingPayload);
        await testCollection.updateOne(tutorQuery, { $inc: { totalSlot: -1 } });

        res.status(201).json({ message: "🎉 Booking completed successfully!", insertedId: bookingResult.insertedId });
      } catch (error) {
        res.status(500).json({ message: "Internal booking process operation failed", error: error.message });
      }
    });

    // Filter kora my tutor e get method
    app.get('/api/v1/my-tutors', verifyToken, async (req, res) => {
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
    app.put('/api/v1/tutors/:id', verifyToken, async (req, res) => {
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
    app.delete('/api/v1/tutors/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await testCollection.deleteOne(query);
        res.status(200).json({ message: "Tutor record deleted successfully!", result });
      } catch (error) {
        res.status(500).json({ message: "Failed to delete tutor record", error: error.message });
      }
    });

    // 1 => GET API: specific student er Email onujayi Booking filter kore niye asa
    app.get('/api/v1/my-bookings', verifyToken, async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).json({ message: "Student email parameter is required." });
        }
        const query = { studentEmail: email };
        const result = await bookingsCollection.find(query).toArray();
        res.status(200).json(result);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch bookings record", error: error.message });
      }
    });

    // => PATCH API: Booking status update kore cancel kora
    app.patch('/api/v1/bookings/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { bookStatus } = req.body;
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

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

// run ফাংশন এক্সিকিউট করা
run().catch(console.dir);

// ২. লোকাল পিসিতে রান করার জন্য এই কন্ডিশন, Vercel-এ এটি স্কিপ হবে (টাইমআউট ফিক্স)
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

// ৩. Vercel-এর সার্ভারলেস আর্কিটেকচারের জন্য এক্সপ্রেস অ্যাপ এক্সপোর্ট করা আবশ্যক
module.exports = app;

// const express = require('express');
// const dotenv = require('dotenv');
// const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// const cors = require('cors');
// const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
// dotenv.config();

// const uri = process.env.MONGO_URI;
// const app = express();
// const port = process.env.PORT || 5000;

// app.use(cors());
// app.use(express.json());

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   }
// });


// const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

// const verifyToken = async (req, res, next) => {
//   const authHeader = req?.headers.authorization;
//   if (!authHeader) {
//     return res.status(401).json({ message: "Unauthorized" });
//   }
//   const token = authHeader.split(" ")[1];
//   if (!token) {
//     return res.status(401).json({ message: "Unauthorized" });
//   }

//   try {
//     const { payload } = await jwtVerify(token, JWKS);
//     console.log(payload);
//     next();
//   } catch (error) {
//     return res.status(403).json({ message: "Forbidden" });
//   }
// };


// async function run() {
//   try {
//     // await client.connect();
//     const db = client.db("medique");
//     const testCollection = db.collection("test_collection");

// //Tutor Feature Get Method
// app.get('/api/v1/available-tutors', async (req, res) => {
     
//   try {
//         const tutors = await testCollection.find({}).limit(6).toArray();
//         res.status(200).json(tutors);
//       }
      
//   catch (error) {
//         res.status(500).json({ message: "Failed to fetch tutors", error: error.message });
//       }
//   });


// // add tutor POST method
// app.post('/api/v1/tutors', verifyToken, async (req, res) => {
//   try {
//     const newTutor = req.body;

//     if (!newTutor.name || !newTutor.photo || !newTutor.subject || !newTutor.hourlyFee) {
//       return res.status(400).json({ message: "Missing required tutor profile fields." });
//     }

//     const result = await testCollection.insertOne(newTutor);
    
//     res.status(201).json({
//       message: "Tutor profile created successfully!",
//       insertedId: result.insertedId
//     });
//   } catch (error) {
//     res.status(500).json({ message: "Failed to store tutor details", error: error.message });
//   }
// });

// // Replace all-turors get id for search and filter method in requirements
// app.get('/api/v1/all-tutors' , async (req, res) => {
//   try {
//     const { search, startDate, endDate } = req.query;
//     let query = {};

//     if (search) {
//       query.name = { $regex: search, $options: "i" };
//     }

//     if (startDate || endDate) {
//       query.startDate = {};
//       if (startDate) {
//         query.startDate.$gte = startDate; 
//       }
//       if (endDate) {
//         query.startDate.$lte = endDate; 
//       }
//     }

//     const allTutors = await testCollection.find(query).toArray();
//     res.status(200).json(allTutors);
//   } catch (error) {
//     res.status(500).json({ message: "Failed to fetch filtered tutors directory records.", error: error.message });
//   }
// });


// // 1. GET API: Fetch detailed profile parameters for a specific tutor by ID
// app.get('/api/v1/tutors/:id', verifyToken , async (req, res) => {
//   try {
//     const id = req.params.id;
    
//     // Check if the passed ID is a valid 24-character hex string before querying MongoDB
//     if (!ObjectId.isValid(id)) {
//       return res.status(400).json({ message: "Invalid Tutor ID format." });
//     }

//     const query = { _id: new ObjectId(id) };
//     const tutor = await testCollection.findOne(query);
    
//     if (!tutor) {
//       return res.status(404).json({ message: "Tutor profile not found." });
//     }
    
//     res.status(200).json(tutor);
//   } catch (error) {
//     res.status(500).json({ message: "Failed to fetch tutor details", error: error.message });
//   }
// });

// // 2. POST API: Process booking transactions with strict backend validation guards
// app.post('/api/v1/bookings', verifyToken, async (req, res) => {
//   try {
//     const bookingData = req.body;
//     const tutorId = bookingData.tutorId;

//     if (!ObjectId.isValid(tutorId)) {
//       return res.status(400).json({ message: "Invalid target Tutor ID parameter format." });
//     }

//     const tutorQuery = { _id: new ObjectId(tutorId) };
//     const tutor = await testCollection.findOne(tutorQuery);

//     if (!tutor) {
//       return res.status(404).json({ message: "The selected tutor profile does not exist." });
//     }

//     const currentSlots = Number(tutor.totalSlot);
//     if (currentSlots <= 0) {
//       return res.status(400).json({ 
//         message: "This session is fully booked. You can’t join at the moment." 
//       });
//     }

//     const currentDate = new Date();
//     const sessionStartDate = new Date(tutor.startDate);

//     currentDate.setHours(0, 0, 0, 0);
//     sessionStartDate.setHours(0, 0, 0, 0);

//     if (currentDate < sessionStartDate) {
//       return res.status(400).json({ 
//         message: "Booking is not available yet for this tutor." 
//       });
//     }

//     const finalBookingPayload = {
//       ...bookingData,
//       bookStatus: "Confirmed",
//       bookedAt: new Date()
//     };

//     const bookingsCollection = client.db("medique").collection("bookings");
//     const bookingResult = await bookingsCollection.insertOne(finalBookingPayload);

//     await testCollection.updateOne(tutorQuery, { $inc: { totalSlot: -1 } });

//     res.status(201).json({ 
//       message: "🎉 Booking completed successfully!", 
//       insertedId: bookingResult.insertedId 
//     });

//   } catch (error) {
//     res.status(500).json({ message: "Internal booking process operation failed", error: error.message });
//   }
// });

// // Filter kora my tutor e get method
// app.get('/api/v1/my-tutors', verifyToken , async (req, res) => {
//   try {
//     const email = req.query.email;
//     if (!email) {
//       return res.status(400).json({ message: "User email query parameter is required." });
//     }
//     const query = { "createdBy.email": email };
//     const result = await testCollection.find(query).toArray();
//     res.status(200).json(result);
//   } catch (error) {
//     res.status(500).json({ message: "Failed to fetch your tutors directory", error: error.message });
//   }
// });

// // My tutor data put
// app.put('/api/v1/tutors/:id', verifyToken , async (req, res) => {
//   try {
//     const id = req.params.id;
//     const updatedData = req.body;
//     const filter = { _id: new ObjectId(id) };
    
//     const updateDoc = {
//       $set: {
//         name: updatedData.name,
//         photo: updatedData.photo,
//         subject: updatedData.subject,
//         hourlyFee: Number(updatedData.hourlyFee),
//         availableDays: updatedData.availableDays,
//         timeSlot: updatedData.timeSlot,
//         totalSlot: Number(updatedData.totalSlot),
//         startDate: updatedData.startDate,
//         institution: updatedData.institution,
//         experience: updatedData.experience,
//         location: updatedData.location,
//         teachingMode: updatedData.teachingMode,
//       }
//     };

//     const result = await testCollection.updateOne(filter, updateDoc);
//     res.status(200).json({ message: "Tutor entry updated successfully!", result });
//   } catch (error) {
//     res.status(500).json({ message: "Failed to update tutor record", error: error.message });
//   }
// });

// // My Tutor theke delete
// app.delete('/api/v1/tutors/:id', verifyToken , async (req, res) => {
//   try {
//     const id = req.params.id;
//     const query = { _id: new ObjectId(id) };
//     const result = await testCollection.deleteOne(query);
//     res.status(200).json({ message: "Tutor record deleted successfully!", result });
//   } catch (error) {
//     res.status(500).json({ message: "Failed to delete tutor record", error: error.message });
//   }
// });


// // 1=> GET API:specific student er Email onujayi Booking filter kore niye asa
// app.get('/api/v1/my-bookings', verifyToken, async (req, res) => {
//   try {
//     const email = req.query.email;
//     if (!email) {
//       return res.status(400).json({ message: "Student email parameter is required." });
//     }

//     const bookingsCollection = client.db("medique").collection("bookings");
//     const query = { studentEmail: email };
//     const result = await bookingsCollection.find(query).toArray();
//     res.status(200).json(result);
//   } catch (error) {
//     res.status(500).json({ message: "Failed to fetch bookings record", error: error.message });
//   }
// });

// // => PATCH API: Booking staus update kore cancel kora
// app.patch('/api/v1/bookings/:id', verifyToken, async (req, res) => {
//   try {
//     const id = req.params.id;
//     const { bookStatus } = req.body;
//     const bookingsCollection = client.db("medique").collection("bookings");
//     const filter = { _id: new ObjectId(id) };
    
//     const updateDoc = {
//       $set: { bookStatus: bookStatus }
//     };

//     const result = await bookingsCollection.updateOne(filter, updateDoc);
//     res.status(200).json({ message: "Booking deployment updated successfully!", result });
//   } catch (error) {
//     res.status(500).json({ message: "Failed to update booking status", error: error.message });
//   }
// });


//   // await client.db("admin").command({ ping: 1 });
//     console.log("Pinged your deployment. You successfully connected to MongoDB!");
//   } catch (error) {
//     console.error("Database connection error:", error);
//   }

  
// }
// run().catch(console.dir);

// app.get('/', (req, res) => {
//     res.send('Medique Server is Running!');
// });

// app.listen(port, () => {
//     console.log(`Server is running on port ${port}`);
// });

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://arscholarpoint.web.app',
    'https://arscholarpoint.firebaseapp.com'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.MONGODB_TWELVE_USER}:${process.env.MONGODB_TWELVE_PASS}@cluster0.esbrpdb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict"
};


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    const userCollection = client.db('arScholarPoint').collection('users');

    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // --- received user from client
    app.post('/users', async (req, res) => {
      const user = req.body;
      console.log(user);
      const result = await userCollection.insertOne(user);
      res.send(result);
    });


    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);


// ------- server run ------
app.get('/', (req, res) => {
  res.send('Server is running...')
});

app.listen(port, () => {
  console.log(`Server is running port: ${port}
  Link: http://localhost:${port}`);
});
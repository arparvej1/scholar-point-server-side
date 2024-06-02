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


const verifyToken = async (req, res, next) => {
  const token = req?.cookies?.token;
  // console.log("token 1", token);
  if (!token) {
    return res.status(401).send({ message: 'not authorized' })
  }
  jwt.verify(token, process.env.JWT_ACCESS_TOKEN_SECRET, (err, decoded) => {
    // ------ error
    if (err) {
      return res.status(401).send({ message: 'this is not authorized' })
    }
    // ----- if token is valid then it would be decoded
    console.log('value in the token', decoded)
    req.user = decoded;
    next();
  })
};


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    //--------- creating Token
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_ACCESS_TOKEN_SECRET, { expiresIn: '5h' });

      res.cookie('token', token, cookieOptions).send({ success: true })
    });

    app.post('/logout', async (req, res) => {
      const user = req.body;
      console.log('logging out', user);
      res.clearCookie('token', { maxAge: 0 }).send({ success: true })
    });

    const userCollection = client.db('arScholarPoint').collection('users');

    app.get('/users/:email', verifyToken, async (req, res) => {
      // console.log(req.params?.email);
      const userEmail = req.params?.email;
      if (req.user.email !== userEmail) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      let filter = {};
      if (req.params?.email) {
        filter = { email: userEmail }
      }
      const result = await userCollection.find(filter).toArray();
      if (result) {
        res.send({ verifyUser: true });
      } else {
        res.send({ verifyUser: false });
      }
    });

    // --- received user from client
    app.post('/users', async (req, res) => {
      const user = req.body;
      console.log(user);
      const result = await userCollection.insertOne(user);
      res.send(result);
    });



    const scholarshipCollection = client.db('arScholarPoint').collection('scholarships');

    // --- send scholarships
    app.get('/scholarships', async (req, res) => {
      const cursor = scholarshipCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // ---- send single scholarship
    app.get('/scholarship/:scholarshipId', async (req, res) => {
      const id = req.params.scholarshipId;
      const query = { _id: new ObjectId(id) }
      const result = await scholarshipCollection.findOne(query);
      res.send(result);
    });

    // --- received scholarships from client
    app.post('/scholarships', async (req, res) => {
      const item = req.body;
      console.log(item);
      const result = await scholarshipCollection.insertOne(item);
      res.send(result);
    });

    // Update scholarship - put
    app.put('/scholarship/:scholarshipId', async (req, res) => {
      const id = req.params.scholarshipId;
      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true };
      const updatedScholarship = req.body;

      const scholarship = {
        $set: {
          scholarshipName: updatedScholarship.new_scholarshipName,
          universityName: updatedScholarship.new_universityName,
          universityLogo: updatedScholarship.new_universityLogo,
          universityCountry: updatedScholarship.new_universityCountry,
          universityCity: updatedScholarship.new_universityCity,
          universityRank: updatedScholarship.new_universityRank,
          subjectCategory: updatedScholarship.new_subjectCategory,
          scholarshipCategory: updatedScholarship.new_scholarshipCategory,
          degree: updatedScholarship.new_degree,
          tuitionFees: updatedScholarship.new_tuitionFees,
          applicationFees: updatedScholarship.new_applicationFees,
          serviceCharge: updatedScholarship.new_serviceCharge,
          applicationDeadline: updatedScholarship.new_applicationDeadline,
          scholarshipPostDate: updatedScholarship.new_scholarshipPostDate,
          postedUserEmail: updatedScholarship.new_postedUserEmail,
          postedUserDisplayName: updatedScholarship.new_postedUserDisplayName,
        }
      }
      const result = await scholarshipCollection.updateOne(filter, scholarship, options);
      res.send(result);
    });


    app.get('/scholarshipsLimit', async (req, res) => {
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);
      const filterQty = parseInt(req.query?.filterQty);
      console.log('filterQty', filterQty);
      let filter = 0;
      if (filterQty >= 1) {
        filter = filterQty === 1 ? { quantity: { $gte: 1 } } : { quantity: { $gte: 0 } };
      } else {
        filter = { quantity: { $lte: 0 } };
      }

      console.log('pagination query', page, size);
      const result = await scholarshipCollection.find()
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });

    app.get('/scholarshipsCount', async (req, res) => {
      const filterQty = parseInt(req.query?.filterQty);
      console.log(filterQty);
      let filter = 0;
      if (filterQty >= 1) {
        filter = filterQty === 1 ? { quantity: { $gte: 1 } } : { quantity: { $gte: 0 } };
      } else {
        filter = { quantity: { $lte: 1 } };
      }
      // const count = scholarshipCollection.estimatedDocumentCount();
      const result = await scholarshipCollection.find().toArray();
      const count = result.length;
      res.send({ count });
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
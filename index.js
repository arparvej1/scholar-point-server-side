const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
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


const verifyToken = (req, res, next) => {
  // console.log('inside verify token', req.headers.authorization);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = req.headers.authorization.split(' ')[1];
  jwt.verify(token, process.env.JWT_ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
};


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    //--------- creating Token
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    app.post('/logout', async (req, res) => {
      const user = req.body;
      console.log('logging out', user);
      res.clearCookie('token', { maxAge: 0 }).send({ success: true })
    });

    const userCollection = client.db('arScholarPoint').collection('users');

    app.get('/users/:email', verifyToken, async (req, res) => {
      console.log(req.params?.email);
      const userEmail = req.params?.email;
      if (req.user.email !== userEmail) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      let filter = {};
      if (req.params?.email) {
        filter = { email: userEmail }
      }
      const result = await userCollection.find(filter).toArray();
      if (result && result.length > 0) {
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

    // ---------------- database entry --------------------
    const adminCollection = client.db('arScholarPoint').collection('adminInfo');


    // --- received user from client
    app.post('/allUsers', async (req, res) => {
      const user = req.body;
      const newUser = { ...user, role: 'user' }
      console.log(newUser);
      const result = await adminCollection.insertOne(newUser);
      res.send(result);
    });

    app.get('/allAdminAndAgent/:email', verifyToken, async (req, res) => {
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      let filter = {};
      if (req.params?.email) {
        filter = { email: req.params.email, role: 'admin' }
      }
      const result = await adminCollection.find(filter).toArray();
      // res.send(result);
      if (result.length > 0) {
        const allAdmin = await adminCollection.find({ role: 'admin' }).toArray();
        const allAgent = await adminCollection.find({ role: 'agent' }).toArray();
        res.send({ allAdmin, allAgent })
      } else {
        res.send({ admin: false })
      }
    });


    app.get('/allUsers/:email', verifyToken, async (req, res) => {
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      let filter = {};
      if (req.params?.email) {
        filter = { email: req.params.email, role: 'admin' };
      }

      const admin = await adminCollection.findOne(filter);

      if (!admin) {
        return res.send({ admin: false });
      }

      const projection = { password: 0 };
      const allUsers = await adminCollection.find({}, projection).toArray();
      res.send(allUsers);
    });

    app.get('/checkEmail/:email', async (req, res) => {
      const email = req.params.email;
      try {
        const result = await adminCollection.findOne({ email });
        if (result) {
          res.send({ exists: true }); // Email exists
        } else {
          res.send({ exists: false }); // Email does not exist
        }
      } catch (error) {
        console.error('Error checking if email exists:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    app.get('/checkAdmin/:email', verifyToken, async (req, res) => {
      // console.log('decoded 1', req.decoded.email);
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      let filter = {};
      if (req.params?.email) {
        filter = { email: req.params.email, role: 'admin' }
      }
      const result = await adminCollection.find(filter).toArray();
      // res.send(result);
      if (result.length > 0) {
        res.send({ admin: true })
      } else {
        res.send({ admin: false })
      }
    });

    app.get('/checkAgent/:email', verifyToken, async (req, res) => {
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      let filter = {};
      if (req.params?.email) {
        filter = { email: req.params.email, role: 'agent' }
      }
      const result = await adminCollection.find(filter).toArray();
      // res.send(result);
      if (result.length > 0) {
        res.send({ agent: true })
      } else {
        res.send({ agent: false })
      }
    });

    // Update admin info - put
    app.put('/updateUser/:email', async (req, res) => {
      const email = req.params.email;
      const filter = { email: email }; // Using email directly as a filter
      const updateUserData = req.body;

      const updateUser = {
        $set: {
          name: updateUserData.name,
          photoURL: updateUserData.photoURL
        }
      }
      try {
        const result = await adminCollection.updateOne(filter, updateUser);
        res.send(result);
      } catch (error) {
        res.status(500).send(error);
      }
    });


    // ---- update user role ---
    app.patch('/updateUser/:userId', verifyToken, async (req, res) => {
      const id = req.params.userId;
      const filterUser = { _id: new ObjectId(id) };
      const userRoleUpdate = req.body;

      const userRole = {
        $set: {
          role: userRoleUpdate.role
        }
      };

      let filter = {};
      if (req.decoded?.email) {
        filter = { email: req.decoded.email, role: 'admin' }
      }
      const isAdmin = await adminCollection.find(filter).toArray();
      if (isAdmin.length > 0) {
        const result = await adminCollection.updateOne(filterUser, userRole);
        res.send(result);
      } else {
        res.send({ admin: false })
      }


    });

    // --- delete user from client
    app.delete('/userDelete/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email }

      let filter = {};
      if (req.decoded?.email) {
        filter = { email: req.decoded.email, role: 'admin' }
      }
      const isAdmin = await adminCollection.find(filter).toArray();
      if (isAdmin.length > 0) {
        const result = await adminCollection.deleteOne(query);
        res.send(result);
      } else {
        res.send({ admin: false })
      }
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

    // --- delete scholarship from client
    app.delete('/scholarship/:scholarshipId', async (req, res) => {
      const id = req.params.scholarshipId;
      const query = { _id: new ObjectId(id) }
      const result = await scholarshipCollection.deleteOne(query);
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
          scholarshipDescription: updatedScholarship.new_scholarshipDescription,
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


    const paymentCollection = client.db("arScholarPoint").collection("payments");

    // payment intent ---------------
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      // console.log(amount, 'amount inside the intent')

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    });


    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email }
      console.log(query);
      console.log(req.decoded.email);
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      res.send({ paymentResult });
    });

    const scholarshipApplyCollection = client.db('arScholarPoint').collection('scholarshipApply');

    // --- send scholarshipApply
    app.get('/allScholarshipApply/:email', verifyToken, async (req, res) => {
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      let filter = {};
      if (req.params?.email) {
        filter = { email: req.params.email, role: { $in: ['admin', 'agent'] } }
      }
      const resultAgent = await adminCollection.find(filter).toArray();
      // res.send(resultAgent);
      if (resultAgent.length > 0) {
        const result = await scholarshipApplyCollection.find().toArray();
        res.send(result);
      } else {
        res.send({ agent: false })
      }
    });

    app.get('/scholarshipApply/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email }
      console.log(query);
      console.log(req.decoded.email);
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await scholarshipApplyCollection.find(query).toArray();
      res.send(result);
    });


    // ---- send single apply
    app.get('/apply/:applyId', async (req, res) => {
      const id = req.params.applyId;
      const query = { _id: new ObjectId(id) }
      const result = await scholarshipApplyCollection.findOne(query);
      res.send(result);
    });

    // --- received scholarshipApply from client
    app.post('/scholarshipApply', async (req, res) => {
      const item = req.body;
      console.log(item);
      const result = await scholarshipApplyCollection.insertOne(item);
      res.send(result);
    });

    // --- delete scholarshipApply from client
    app.delete('/apply/:applyId', async (req, res) => {
      const id = req.params.applyId;
      const query = { _id: new ObjectId(id) }
      const result = await scholarshipApplyCollection.deleteOne(query);
      res.send(result);
    });


    // Update scholarshipApply - put
    app.put('/scholarshipApply/:applyId', async (req, res) => {
      const id = req.params.applyId;
      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true };
      const updatedScholarshipApply = req.body;

      const scholarshipApply = {
        $set: {
          applicantPhoneNumber: updatedScholarshipApply.new_applicantPhoneNumber,
          applicantAddressVillage: updatedScholarshipApply.new_applicantAddressVillage,
          applicantAddressDistrict: updatedScholarshipApply.new_applicantAddressDistrict,
          applicantAddressCountry: updatedScholarshipApply.new_applicantAddressCountry,
          applicantGender: updatedScholarshipApply.new_applicantGender,
          applicantApplyingDegree: updatedScholarshipApply.new_applicantApplyingDegree,
          sscResult: updatedScholarshipApply.new_sscResult,
          hscResult: updatedScholarshipApply.new_hscResult,
          studyGap: updatedScholarshipApply.new_studyGap,
          universityName: updatedScholarshipApply.new_universityName,
          scholarshipCategory: updatedScholarshipApply.new_scholarshipCategory,
          subjectCategory: updatedScholarshipApply.new_subjectCategory,
          email: updatedScholarshipApply.new_email,
          userDisplayName: updatedScholarshipApply.new_userDisplayName,
          scholarshipId: updatedScholarshipApply.new_scholarshipId,
          applyDate: updatedScholarshipApply.new_applyDate,
          applicantPhoto: updatedScholarshipApply.new_applicantPhoto,
          applicationFees: updatedScholarshipApply.new_applicationFees,
          serviceCharge: updatedScholarshipApply.new_serviceCharge,
          scholarshipName: updatedScholarshipApply.new_scholarshipName,
          applicationStatus: updatedScholarshipApply.new_applicationStatus
        }
      }
      const result = await scholarshipApplyCollection.updateOne(filter, scholarshipApply, options);
      res.send(result);
    });


    // scholarshipApply feedback - put
    app.put('/scholarshipApplyFeedback/:applyId', async (req, res) => {
      const id = req.params.applyId;
      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true };
      const updatedScholarshipApply = req.body;

      const scholarshipApply = {
        $set: {
          applicantFeedback: updatedScholarshipApply.applicantFeedback,
        }
      }
      const result = await scholarshipApplyCollection.updateOne(filter, scholarshipApply, options);
      res.send(result);
    });

    // ---- update applicationStatus ---
    app.patch('/scholarshipApply/:applyId', async (req, res) => {
      const id = req.params.applyId;
      const filter = { _id: new ObjectId(id) };
      // const options = { upsert: true };
      const updatedScholarshipApply = req.body;

      const scholarshipApply = {
        $set: {
          applicationStatus: updatedScholarshipApply.new_applicationStatus
        }
      };

      const result = await scholarshipApplyCollection.updateOne(filter, scholarshipApply);
      res.send(result);
    });



    const reviewCollection = client.db('arScholarPoint').collection('reviews');

    // --- send reviews
    app.get('/reviews', async (req, res) => {
      const cursor = reviewCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // ---- send filter reviews
    app.get('/reviewsFilter', async (req, res) => {
      // const id = req.params.scholarshipId;
      const id = req.query.scholarshipId;
      console.log(id);
      const query = { scholarshipId: id }
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/myReviews/:email', verifyToken, async (req, res) => {
      const query = { reviewerEmail: req.params.email }
      console.log(query);
      console.log(req.decoded.email);
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });

    // --- received reviews from client
    app.post('/reviews', async (req, res) => {
      const item = req.body;
      console.log(item);
      const result = await reviewCollection.insertOne(item);
      res.send(result);
    });

    // --- delete reviews from client
    app.delete('/review/:reviewId', async (req, res) => {
      const id = req.params.reviewId;
      const query = { _id: new ObjectId(id) }
      const result = await reviewCollection.deleteOne(query);
      res.send(result);
    });


    // Update review - put
    app.put('/review/:reviewId', async (req, res) => {
      const id = req.params.reviewId;
      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true };
      const updatedReview = req.body;

      const review = {
        $set: {
          reviewerImage: updatedReview.new_reviewerImage,
          reviewerName: updatedReview.new_reviewerName,
          reviewerEmail: updatedReview.new_reviewerEmail,
          reviewDate: updatedReview.new_reviewDate,
          rating: updatedReview.new_rating,
          comment: updatedReview.new_comment,
          scholarshipId: updatedReview.new_scholarshipId,
          universityName: updatedReview.new_universityName,
          scholarshipName: updatedReview.new_scholarshipName
        }
      }
      const result = await reviewCollection.updateOne(filter, review, options);
      res.send(result);
    });

    
    const subscriberCollection = client.db('arScholarPoint').collection('subscriber');

    // --- received newSubscriber from client
    app.post('/subscriber', async (req, res) => {
      const subscriber = req.body;
      console.log(subscriber);
      const result = await subscriberCollection.insertOne(subscriber);
      res.send(result);
    });

    // --- newSubscriber check
    app.get('/checkSubscriber', async (req, res) => {
      const newSubscriber = req.query.email;
      let filter = { subscribeEmail: newSubscriber };
      const result = await subscriberCollection.find(filter).toArray();
      const subscribed = result.length ? true : false;
      res.send({ subscribed });
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
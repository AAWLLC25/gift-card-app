// ===================================================================================
// GIFT CARD SERVER - Node.js / Express
// ===================================================================================
// This server handles the payment processing with Square and gift card creation with Acuity.
// It is designed to be deployed on a service like Render.
//
// --- DEPLOYMENT INSTRUCTIONS (RENDER) ---
// 1. Add this file and index.html to a GitHub repository. DO NOT ADD .env.
// 2. Create a new "Web Service" on Render and connect your GitHub repo.
// 3. Set the Build Command to: npm install
// 4. Set the Start Command to: node server.js
// 5. In the "Environment" tab on Render, add your secret keys:
//    - Key: SQUARE_ACCESS_TOKEN, Value: YOUR_SQUARE_ACCESS_TOKEN
//    - Key: ACUITY_USER_ID,      Value: YOUR_ACUITY_USER_ID
//    - Key: ACUITY_API_KEY,      Value: YOUR_ACUITY_API_KEY
// ===================================================================================

const express = require('express');
const path = require('path');
const { Client } = require('square'); // FIX: Reverted to destructuring, which is standard. The issue lies elsewhere.
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
// Serve static files from the 'public' directory (or root)
app.use(express.static(path.join(__dirname)));


// --- Initialize Square Client ---
const squareClient = new Client({ // This is the standard way, the error points to a module resolution issue.
  environment: 'sandbox', 
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
});

// --- API Endpoint for Payment ---
app.post('/api/create-payment', async (req, res) => {
  const { token, totalAmount, ...formData } = req.body;

  try {
    // 1. Create the payment with Square
    console.log('Creating payment with Square...');
    const paymentResponse = await squareClient.paymentsApi.createPayment({
      sourceId: token,
      idempotencyKey: uuidv4(),
      amountMoney: {
        amount: BigInt(Math.round(totalAmount * 100)),
        currency: 'USD',
      },
    });

    const paymentId = paymentResponse.result.payment.id;
    console.log('Square payment successful. Payment ID:', paymentId);

    // 2. Create the gift certificate in Acuity
    let certificateId = null;
    if (formData.delivery_method === 'email') {
        if (formData.send_time === 'now') {
            console.log('Creating Acuity certificate immediately...');
            certificateId = await createAcuityCertificate(formData);
            console.log('Acuity certificate created. Certificate ID:', certificateId);
        } else {
            console.log('SCHEDULING FOR LATER:', { /* ... details ... */ });
            certificateId = 'SCHEDULED';
        }
    } else {
        console.log('Physical card selected. No immediate Acuity certificate needed.');
        certificateId = 'PHYSICAL_CARD_ORDER';
    }

    // 3. Send a success response
    res.status(200).json({
      success: true,
      paymentId: paymentId,
      certificateId: certificateId,
    });

  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred during payment processing.',
    });
  }
});

// --- Serve the main HTML file ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// --- Acuity API Helper Function ---
async function createAcuityCertificate(data) {
    const fetch = (await import('node-fetch')).default;
    const acuityUrl = 'https://acuityscheduling.com/api/v1/certificates';
    
    const userId = process.env.ACUITY_USER_ID;
    const apiKey = process.env.ACUITY_API_KEY;
    const auth = 'Basic ' + Buffer.from(userId + ':' + apiKey).toString('base64');

    const [firstName, ...lastNameParts] = data.recipient_name.split(' ');
    const lastName = lastNameParts.join(' ') || '';

    const certificateData = {
        email: data.recipient_email,
        firstName: firstName,
        lastName: lastName,
        value: data.amount,
    };

    try {
        const response = await fetch(acuityUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': auth },
            body: JSON.stringify(certificateData),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Acuity API Error: ${response.status} - ${errorBody}`);
        }
        const responseData = await response.json();
        return responseData.id;
    } catch (error) {
        console.error('Failed to create Acuity certificate:', error);
        throw error;
    }
}

// --- Start the Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

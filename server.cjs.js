// ===================================================================================
// GIFT CARD SERVER - Node.js / Express
// ===================================================================================
// This server handles the payment processing with Square and gift card creation with Acuity.
// It is designed to be deployed on a service like Render.
//
// --- DEPLOYMENT INSTRUCTIONS (RENDER) ---
// 1. Add this file, index.html, and package.json to a GitHub repository.
// 2. Create a new "Web Service" on Render and connect your GitHub repo.
// 3. Set the Build Command to: npm install
// 4. Set the Start Command to: node server.js
// 5. In the "Environment" tab on Render, add your secret keys.
// ===================================================================================

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// We will initialize the squareClient inside an async function
let squareClient;

// --- Main async function to start the server ---
async function startServer() {
  try {
    // FIX: Use a dynamic import for the Square library to ensure compatibility.
    const { Client } = await import('square');

    squareClient = new Client({
      environment: 'sandbox',
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
    });
    console.log('Square client initialized successfully.');

    // --- API Endpoint for Payment ---
    app.post('/api/create-payment', async (req, res) => {
      const { token, totalAmount, ...formData } = req.body;

      try {
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

    // --- Start the Server ---
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  }
}

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

// --- Run the main server function ---
startServer();

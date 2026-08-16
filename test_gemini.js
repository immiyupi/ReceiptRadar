import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

console.log("GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  try {
    // Let's test with a tiny 1x1 transparent pixel base64
    const base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const mimeType = "image/png";

    console.log("Calling Gemini API...");
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: [
        {
          parts: [
            {
              text: `You are a receipt data extraction assistant.
Extract the following from this receipt image:
1. Transaction date in ISO YYYY-MM-DD format.
2. Merchant / vendor name.
3. The strict FINAL total amount paid (Net Total / Grand Total) AFTER any discounts, taxes, or promotions have been applied. Do NOT use the subtotal or pre-discount price.
4. Assign a category from this list:
   [Food & Dining, Entertainment, Travel, Shopping, Investment, Other].
Return valid JSON only.`
            },
            {
              inlineData: { mimeType, data: base64Data }
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            date:     { type: 'STRING',  description: 'ISO YYYY-MM-DD' },
            vendor:   { type: 'STRING',  description: 'Merchant name' },
            amount:   { type: 'NUMBER',  description: 'Strict FINAL total paid after all discounts, taxes, and promotions' },
            category: {
              type: 'STRING',
              enum: ['Food & Dining','Entertainment','Travel','Shopping','Investment','Other']
            }
          },
          required: ['date', 'vendor', 'amount', 'category']
        }
      }
    });

    console.log("Gemini API call complete.");
    const text = response.text;
    console.log("Response text:", text);
    if (!text) {
      console.log("No text in response. Response candidates:", JSON.stringify(response.candidates, null, 2));
    } else {
      let cleanedText = text.trim();
      if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
      }
      const parsed = JSON.parse(cleanedText);
      console.log("Parsed JSON:", parsed);
    }
  } catch (err) {
    console.error("Error occurred:", err);
  }
}

test();

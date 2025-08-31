import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API endpoint for generating suggestions
app.post('/api/generate', async (req, res) => {
  try {
    const { planText } = req.body;
    
    if (!planText || planText.trim().length < 50) {
      return res.status(400).json({ error: 'Læringsplan skal være mindst 50 tegn lang' });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `Du er en ekspert i læring og udvikling. Analyser den givne læringsplan og foreslå 3 konkrete, handlingsorienterede tiltag til forbedring. 

Svar ALTID på dansk og i følgende JSON-format:
{
  "actions": [
    {
      "title": "Kort, handlingsorienteret titel",
      "description": "Detaljeret beskrivelse af tiltaget og hvorfor det er vigtigt",
      "impact": "Høj/Medium/Lav",
      "effort": "Høj/Medium/Lav",
      "steps": ["Konkret trin 1", "Konkret trin 2", "Konkret trin 3"]
    }
  ]
}

Fokuser på praktiske, implementerbare tiltag der kan forbedre læringen.`
        },
        {
          role: "user",
          content: `Analyser denne læringsplan og foreslå 3 konkrete tiltag til forbedring:\n\n${planText}`
        }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const response = JSON.parse(completion.choices[0].message.content);
    res.json(response);
    
  } catch (error) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({ error: 'Fejl ved generering af forslag' });
  }
});

// API endpoint for PDF extraction
app.post('/api/extract-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Ingen PDF-fil uploadet' });
    }

    // Convert PDF buffer to base64
    const base64Pdf = req.file.buffer.toString('base64');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Ekstrahér al tekst fra denne PDF og returner den som ren tekst på dansk. Bevar strukturen og formatering så godt som muligt."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${base64Pdf}`
              }
            }
          ]
        }
      ],
      max_tokens: 4000
    });

    const extractedText = completion.choices[0].message.content;
    res.json({ text: extractedText });
    
  } catch (error) {
    console.error('Error extracting PDF:', error);
    res.status(500).json({ error: 'Fejl ved læsning af PDF' });
  }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server kører på http://localhost:${port}`);
});
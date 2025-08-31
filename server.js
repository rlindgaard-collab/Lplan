import express from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Generate suggestions from text
app.post('/api/generate', async (req, res) => {
  try {
    const { planText } = req.body;
    
    if (!planText || planText.trim().length < 50) {
      return res.status(400).json({ error: 'Læringsplan skal være mindst 50 tegn lang' });
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `Du er en ekspert i læring og udvikling. Analyser den givne læringsplan og foreslå præcis 3 konkrete, handlingsorienterede tiltag der kan forbedre læringen. 

Svar ALTID i dette JSON format:
{
  "actions": [
    {
      "title": "Kort beskrivende titel",
      "description": "Detaljeret beskrivelse af tiltaget",
      "impact": "Høj/Medium/Lav",
      "effort": "Høj/Medium/Lav",
      "steps": ["Trin 1", "Trin 2", "Trin 3"]
    }
  ]
}

Fokuser på praktiske, implementerbare forslag der direkte adresserer læringsbehov i planen.`
        },
        {
          role: 'user',
          content: `Analyser denne læringsplan og foreslå 3 konkrete tiltag:\n\n${planText}`
        }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const responseText = completion.choices[0].message.content;
    const jsonResponse = JSON.parse(responseText);
    
    res.json(jsonResponse);
  } catch (error) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({ error: 'Fejl ved generering af forslag' });
  }
});

// Generate suggestions from PDF
app.post('/api/generate-from-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Ingen PDF fil uploadet' });
    }

    // Read the PDF file
    const pdfBuffer = fs.readFileSync(req.file.path);
    
    // Extract text from PDF
    const pdfData = await pdfParse(pdfBuffer);
    const extractedText = pdfData.text;
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    if (!extractedText || extractedText.trim().length < 50) {
      return res.status(400).json({ error: 'PDF indeholder ikke nok tekst til at generere forslag' });
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `Du er en ekspert i læring og udvikling. Analyser den givne læringsplan og foreslå præcis 3 konkrete, handlingsorienterede tiltag der kan forbedre læringen. 

Svar ALTID i dette JSON format:
{
  "actions": [
    {
      "title": "Kort beskrivende titel",
      "description": "Detaljeret beskrivelse af tiltaget",
      "impact": "Høj/Medium/Lav",
      "effort": "Høj/Medium/Lav",
      "steps": ["Trin 1", "Trin 2", "Trin 3"]
    }
  ]
}

Fokuser på praktiske, implementerbare forslag der direkte adresserer læringsbehov i planen.`
        },
        {
          role: 'user',
          content: `Analyser denne læringsplan og foreslå 3 konkrete tiltag:\n\n${extractedText}`
        }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const responseText = completion.choices[0].message.content;
    const jsonResponse = JSON.parse(responseText);
    
    res.json(jsonResponse);
  } catch (error) {
    console.error('Error extracting PDF:', error);
    res.status(500).json({ error: 'Fejl ved læsning af PDF' });
  }
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.listen(port, () => {
  console.log(`Server kører på http://localhost:${port}`);
});
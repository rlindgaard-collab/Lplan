import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { OpenAI } from 'openai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: parseInt(process.env.DAILY_REQ_LIMIT) || 50,
  message: { error: 'For mange forespørgsler i dag. Prøv igen i morgen.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Multer setup for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Kun PDF-filer er tilladt'));
    }
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/api/', limiter);

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
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
          content: `Du er en ekspert i læring og udvikling. Analyser den givne læringsplan og foreslå 3 konkrete, actionable tiltag der kan hjælpe med at implementere planen.

Hvert tiltag skal have:
- title: En kort, klar titel (max 60 tegn)
- description: En beskrivelse af tiltaget (max 200 tegn)
- impact: "Høj", "Medium" eller "Lav"
- effort: "Høj", "Medium" eller "Lav"
- steps: Array af 3-5 konkrete handlingstrin

Svar kun med valid JSON i dette format:
{
  "actions": [
    {
      "title": "...",
      "description": "...",
      "impact": "...",
      "effort": "...",
      "steps": ["...", "...", "..."]
    }
  ]
}`
        },
        {
          role: 'user',
          content: `Analyser denne læringsplan og foreslå 3 konkrete tiltag:\n\n${planText}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1500
    });

    const result = JSON.parse(completion.choices[0].message.content);
    res.json(result);

  } catch (error) {
    console.error('OpenAI API error:', error);
    res.status(500).json({ 
      error: error.message || 'Fejl ved generering af forslag' 
    });
  }
});

// Generate suggestions from PDF
app.post('/api/generate-from-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Ingen PDF-fil uploadet' });
    }

    // Read the PDF file as base64
    const pdfBuffer = fs.readFileSync(req.file.path);
    const base64Pdf = pdfBuffer.toString('base64');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Du er en ekspert i læring og udvikling. Analyser den uploadede PDF læringsplan og foreslå 3 konkrete, actionable tiltag der kan hjælpe med at implementere planen.

Hvert tiltag skal have:
- title: En kort, klar titel (max 60 tegn)
- description: En beskrivelse af tiltaget (max 200 tegn)
- impact: "Høj", "Medium" eller "Lav"
- effort: "Høj", "Medium" eller "Lav"
- steps: Array af 3-5 konkrete handlingstrin

Svar kun med valid JSON i dette format:
{
  "actions": [
    {
      "title": "...",
      "description": "...",
      "impact": "...",
      "effort": "...",
      "steps": ["...", "...", "..."]
    }
  ]
}`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyser denne PDF læringsplan og foreslå 3 konkrete tiltag:'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${base64Pdf}`
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1500
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    const result = JSON.parse(completion.choices[0].message.content);
    res.json(result);

  } catch (error) {
    console.error('PDF processing error:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: error.message || 'Fejl ved behandling af PDF' 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server kører på http://localhost:${PORT}`);
});
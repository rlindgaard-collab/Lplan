import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import OpenAI from 'openai';
import multer from 'multer';
import pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Basic CORS (same-origin by default; tweak if hosting frontend separately)
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Kun PDF-filer er tilladt'));
    }
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Simple daily request cap per IP to control costs (adjust as needed)
const dailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  limit: parseInt(process.env.DAILY_REQ_LIMIT || '50', 10), // e.g., 50 requests/day/IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Forbrugsloft nået for i dag. Prøv igen i morgen.' }
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Extract text from uploaded PDF
app.post('/api/extract-pdf', dailyLimiter, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Ingen PDF-fil uploadet.' });
    }

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: req.file.buffer });
    const pdf = await loadingTask.promise;
    
    let text = '';
    
    // Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      text += pageText + ' ';
    }
    
    const extractedText = text.trim();
    
    if (extractedText.length < 50) {
      return res.status(400).json({ error: 'PDF\'en indeholder ikke nok tekst til at danne en læringsplan.' });
    }

    res.json({ text: extractedText });
  } catch (err) {
    console.error('PDF extraction error:', err);
    res.status(500).json({ error: 'Kunne ikke læse PDF-filen. Sørg for at det er en gyldig PDF med tekst.' });
  }
});

// Generate actionable suggestions from a learning plan
app.post('/api/generate', dailyLimiter, async (req, res) => {
  try {
    const { planText } = req.body || {};
    if (!planText || typeof planText !== 'string' || planText.trim().length < 50) {
      return res.status(400).json({ error: 'Indsæt en længere læringsplan (min. ~50 tegn).' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY mangler på serveren.' });
    }

    const systemPrompt = `
Du er studievejleder-assistent. Du omdanner en læringsplan til tre konkrete tiltag.
Svar i gyldig JSON med følgende struktur og intet andet:
{
  "actions": [
    {
      "title": "kort titel",
      "description": "kort beskrivelse (1-2 sætninger)",
      "impact": "Lav|Middel|Høj",
      "effort": "Lav|Middel|Høj",
      "steps": ["trin 1", "trin 2", "trin 3"]
    },
    ...
  ]
}
Krav: præcise, gennemførbare trin. Ingen personfølsomme data. Dansk sprog.`.trim();

    const userPrompt = planText.slice(0, 20000); // hard cap input size

    // Use Chat Completions with JSON mode for broad compatibility
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    });

    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'Intet svar fra modellen.' });
    }
    let data;
    try {
      data = JSON.parse(content);
    } catch (e) {
      // Fallback: try to extract JSON block
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        data = JSON.parse(match[0]);
      } else {
        throw e;
      }
    }

    // Basic validation and trimming
    if (!data.actions || !Array.isArray(data.actions)) {
      return res.status(502).json({ error: 'Modellen returnerede ikke forventet struktur.' });
    }
    data.actions = data.actions.slice(0, 3).map(a => ({
      title: String(a.title || '').slice(0, 120),
      description: String(a.description || '').slice(0, 500),
      impact: ['Lav','Middel','Høj'].includes(a.impact) ? a.impact : 'Middel',
      effort: ['Lav','Middel','Høj'].includes(a.effort) ? a.effort : 'Middel',
      steps: Array.isArray(a.steps) ? a.steps.slice(0, 6).map(s => String(s).slice(0, 200)) : []
    }));

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Noget gik galt. Prøv igen.' });
  }
});

app.listen(port, () => {
  console.log(`Server kører på http://localhost:${port}`);
});
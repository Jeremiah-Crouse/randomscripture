// server.js
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const PORT = process.env.PORT || 3000;

// Path to Liber Legis JSON (adjust as needed)
const liberPath = path.join(__dirname, 'liber', 'liber_legis.json');
let liber = null;
// Load Liber Legis once at startup
if (fs.existsSync(liberPath)) {
  liber = JSON.parse(fs.readFileSync(liberPath, 'utf8'));
}

const app = express();
app.use(express.static('public'));

async function getQuantumInts(n) {
  try {
    const url = `https://qrng.anu.edu.au/API/jsonI.php?length=${n}&type=uint16`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.success && Array.isArray(data.data) && data.data.length === n) return data.data;
    throw Error("Quantum fail");
  } catch {
    return null;
  }
}

// Example Bible metadata (you must customize this with real data if you enable Bible mode!)
const bibleMeta = [
  // Example for demo/prototyping
  { name: 'Genesis', chapters: [31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26] },
  // ... Add the rest of the 66 books if you implement Bible mode fully ...
];

const BIBLE_API_KEY = 'YOUR_BIBLE_API_KEY'; // <-- Add your key if you use Bible mode
const bibleID = 'de4e12af7f28f599-01'; // ESV example for api.scripture.api.bible

app.get('/get-verse', async (req, res) => {
  let mode = 'bible';
  let picks = await getQuantumInts(3);

  if (!picks) {
    // Fallback: liber mode
    picks = [Math.floor(Math.random()*3), Math.floor(Math.random()*220), Math.floor(Math.random()*60)];
    mode = 'liber';
  }

  if (mode === 'bible' && bibleMeta.length >= 1) {
    // For demo: picks from Genesis only unless full meta added
    const bookIdx = picks[0] % bibleMeta.length;
    const book = bibleMeta[bookIdx];
    const chapterIdx = picks[1] % book.chapters.length;
    const chapter = chapterIdx + 1;
    const verseIdx = picks[2] % book.chapters[chapterIdx];
    const verse = verseIdx + 1;
    const ref = `${book.name} ${chapter}:${verse}`;
    // EXAMPLE: If you implement full mode, fetch from API
    // const url = `https://api.scripture.api.bible/v1/bibles/${bibleID}/passages?reference=${encodeURIComponent(ref)}`;
    // const resp = await fetch(url, { headers: { 'api-key': BIBLE_API_KEY }});
    // const data = await resp.json();
    // res.json({mode, book: book.name, chapter, verse, text: data.data && data.data.content ? data.data.content.replace(/<[^>]*>/g,'') : "(No API key or verse missing)"});
    // DEMO/MVP fallback:
    res.json({mode, book: book.name, chapter, verse, text: `Sample: ${ref}`});
    return;
  } 
  // LIBER LEGIS MODE
  const section = (picks[0] % 3) + 1;
  const liberVerses = liber[String(section)];
  const verseIdx = picks[1] % liberVerses.length;
  const verseText = liberVerses[verseIdx];
  res.json({
    mode, section, verse: verseIdx + 1, text: verseText
  });
});

app.listen(PORT, () => console.log(`Spirit-Reader backend running on ${PORT}`));

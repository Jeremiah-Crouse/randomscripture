// server.js
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static('public'));

// --- Load and flatten KJV Bible data ---
const kjvData = JSON.parse(fs.readFileSync(path.join(__dirname, 'bible', 'kjv.json'), 'utf8'));
const flatKJV = [];
kjvData.book.forEach(bookObj => {
  bookObj.chapters.forEach(chapObj => {
    chapObj.verses.forEach(verseObj => {
      flatKJV.push({
        book: bookObj.name,
        chapter: chapObj.chapter,
        verse: verseObj.verse,
        text: verseObj.text
      });
    });
  });
});
const numVerses = flatKJV.length;

// --- Load Liber Legis fallback, if present ---
const liberPath = path.join(__dirname, 'liber', 'liber_legis.json');
let liber = null;
if (fs.existsSync(liberPath)) {
  liber = JSON.parse(fs.readFileSync(liberPath, 'utf8'));
}

// --- Quantum random helper ---
async function getQuantumIndex(max) {
  try {
    const url = `https://qrng.anu.edu.au/API/jsonI.php?length=1&type=uint16`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.success && Array.isArray(data.data) && data.data.length === 1) {
      return data.data[0] % max;
    }
    throw Error("Quantum fail");
  } catch {
    return null;
  }
}

app.get('/get-verse', async (req, res) => {
  // Try quantum first
  let index = await getQuantumIndex(numVerses);
  let mode = 'bible';

  if (index === null) {
    mode = 'liber';
    if (liber) {
      // Random section (1-3), then random verse index in that section
      const section = (Math.floor(Math.random() * 3) + 1).toString();
      const verses = liber[section];
      const vIdx = Math.floor(Math.random() * verses.length);
      res.json({
        mode,
        section,
        verse: vIdx + 1,
        text: verses[vIdx]
      });
      return;
    } else {
      // Fallback: random Bible verse if Liber not present
      index = Math.floor(Math.random() * numVerses);
      mode = 'bible-pseudo';
    }
  }

  const verseObj = flatKJV[index];
  res.json({
    mode,
    book: verseObj.book,
    chapter: verseObj.chapter,
    verse: verseObj.verse,
    text: verseObj.text
  });
});

app.listen(PORT, () => console.log(`Spirit-Reader backend running on port ${PORT}`));

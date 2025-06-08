// server.js
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static('public'));

// Load KJV Bible data
const kjvPath = path.join(__dirname, 'bible', 'kjv.json');
const kjv = JSON.parse(fs.readFileSync(kjvPath, 'utf8'));
const numVerses = kjv.length;

// Load Liber Legis fallback, if present
const liberPath = path.join(__dirname, 'liber', 'liber_legis.json');
let liber = null;
if (fs.existsSync(liberPath)) {
  liber = JSON.parse(fs.readFileSync(liberPath, 'utf8'));
}

async function getQuantumIndex(max) {
  try {
    const url = `https://qrng.anu.edu.au/API/jsonI.php?length=1&type=uint16`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.success && Array.isArray(data.data) && data.data.length === 1) {
      // Scale quantum number to desired range (0, ..., max-1)
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
      // Fallback: random Bible verse if Liber not present (with clear mode label)
      index = Math.floor(Math.random() * numVerses);
      mode = 'bible-pseudo';
    }
  }

  // Return Bible verse (quantum or pseudo)
  const verseObj = kjv[index];
  res.json({
    mode,
    book: verseObj.book,
    chapter: verseObj.chapter,
    verse: verseObj.verse,
    text: verseObj.text
  });
});

app.listen(PORT, () => console.log(`Spirit-Reader backend running on port ${PORT}`));

// server.js
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const PORT = process.env.PORT || 3000;

const app = express();

// --- IMPORTANT FIX: Serve static files from the root directory where server.js is located ---
// This ensures index.html and any other static assets (like kjv.json if it's there) are served.
app.use(express.static(__dirname));

// --- Explicitly serve index.html for the root route ---
// This is good practice even with express.static, ensuring / always serves index.html
app.get('/', (req, res) => {
  console.log("Serving index.html to client.");
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Load and flatten KJV Bible data ---
// Ensure 'bible' directory is at the same level as server.js
const kjvDataPath = path.join(__dirname, 'bible', 'kjv.json');
let kjvData;
try {
  kjvData = JSON.parse(fs.readFileSync(kjvDataPath, 'utf8'));
  console.log("KJV.json loaded successfully.");
} catch (e) {
  console.error(`Error loading KJV.json from ${kjvDataPath}:`, e);
  process.exit(1); // Exit if critical data cannot be loaded
}

const flatKJV = [];
const bookToKJVChapterVerseCounts = {}; // Map book names to their chapter verse counts from the KJV structure

kjvData.book.forEach(bookObj => {
  const chaptersArray = []; // To store verse counts for each chapter of this book
  bookObj.chapters.forEach(chapObj => {
    // Add verse count for this chapter to its array (0-indexed array represents 1-indexed chapters)
    chaptersArray.push(chapObj.verses.length);
    chapObj.verses.forEach(verseObj => {
      flatKJV.push({
        book: bookObj.name,
        chapter: chapObj.chapter,
        verse: verseObj.verse,
        text: verseObj.text
      });
    });
  });
  bookToKJVChapterVerseCounts[bookObj.name] = chaptersArray;
});
const numVerses = flatKJV.length;
console.log(`Loaded ${numVerses} verses from KJV.json.`);

// --- Load Liber Legis fallback, if present ---
// Ensure 'liber' directory is at the same level as server.js
const liberPath = path.join(__dirname, 'liber', 'liber_legis.json');
let liber = null;
if (fs.existsSync(liberPath)) {
  try {
    liber = JSON.parse(fs.readFileSync(liberPath, 'utf8'));
    console.log("Liber Legis loaded successfully.");
  } catch (e) {
    console.error("Error parsing liber_legis.json:", e);
    liber = null; // Ensure liber is null if parsing fails
  }
} else {
  console.log("Liber Legis file not found. Fallback to Liber Legis will not be available.");
}


// --- Quantum Random Number (QRN) Stack Configuration ---
const ANU_QRNG_API_URL = 'https://qrng.anu.edu.au/API/jsonI.php';
const UINT16_MAX = 65535; // Max value for a uint16 number from ANU QRNG
const STACK_SIZE = 512;   // Number of QRNs to fetch per batch
const REFILL_THRESHOLD = 20; // Trigger refill when stack has fewer than this many numbers left

let quantumStack = []; // The array to hold fetched QRNs

/**
 * Scales a random number obtained from QRNG (0-65535) to a desired range.
 * @param {number} qrngNum The quantum random number (0 to UINT16_MAX).
 * @param {number} maxRange The upper bound of the desired range (exclusive, e.g., length of an array).
 * @returns {number} The scaled random number within the desired range.
 */
const scaleQrngNumber = (qrngNum, maxRange) => {
  return Math.floor(qrngNum / (UINT16_MAX + 1) * maxRange);
};

/**
 * Fetches a batch of quantum random numbers and adds them to the quantumStack.
 * On failure, generates pseudo-random numbers and logs an error.
 * This function is designed to refill the stack.
 */
const refillQuantumStack = async () => {
  console.log("Attempting to refill quantum stack...");
  try {
    const response = await fetch(`${ANU_QRNG_API_URL}?length=${STACK_SIZE}&type=uint16`);
    if (!response.ok) {
      throw new Error(`QRNG API error during refill: ${response.statusText}`);
    }
    const data = await response.json();

    if (data && data.success && Array.isArray(data.data) && data.data.length === STACK_SIZE) {
      quantumStack = quantumStack.concat(data.data);
      console.log(`Successfully refilled quantum stack with ${STACK_SIZE} numbers. Current size: ${quantumStack.length}`);
    } else {
      throw new Error("QRNG API returned unexpected data structure or not enough numbers.");
    }
  } catch (err) {
    console.error("Error during quantum stack refill, falling back to pseudo-random numbers for refill:", err);
    for (let i = 0; i < STACK_SIZE; i++) {
      quantumStack.push(Math.floor(Math.random() * (UINT16_MAX + 1)));
    }
    console.log(`Refilled quantum stack with ${STACK_SIZE} pseudo-random numbers due to error. Current size: ${quantumStack.length}`);
  }
};

/**
 * Retrieves a specified count of random numbers from the quantumStack.
 * Triggers a refill if needed. Falls back to Math.random() if stack is exhausted.
 * @param {number} count The number of random numbers to retrieve.
 * @returns {Promise<Object>} A promise that resolves to an object { success: boolean, numbers: Array<number> }.
 * `success` indicates if all numbers were truly quantum.
 */
const getQuantumNumbersFromStack = async (count) => {
  if (quantumStack.length < REFILL_THRESHOLD) {
    console.log(`Quantum stack below threshold (${quantumStack.length}/${REFILL_THRESHOLD}), attempting refill.`);
    await refillQuantumStack();
  }

  const numbers = [];
  let fullyQuantum = true;

  for (let i = 0; i < count; i++) {
    if (quantumStack.length > 0) {
      numbers.push(quantumStack.shift());
    } else {
      console.warn("Quantum stack exhausted (even after refill attempt), falling back to Math.random() for individual number.");
      numbers.push(Math.floor(Math.random() * (UINT16_MAX + 1)));
      fullyQuantum = false;
    }
  }
  return { success: fullyQuantum, numbers: numbers };
};

// --- API Endpoint to get a random verse ---
app.get('/get-verse', async (req, res) => {
  console.log("Received request for /get-verse.");
  let mode = 'bible-pseudo'; // Default to pseudo-random Bible if nothing else applies
  let verseToReturn = {};

  try {
    // Attempt to get quantum random numbers for book, chapter, and verse
    const qrngResult = await getQuantumNumbersFromStack(3);
    const randomNums = qrngResult.numbers;

    // Use quantum numbers if successful, otherwise generate pseudo-random
    if (qrngResult.success && randomNums.length === 3) {
      // Quantum path for KJV Bible
      mode = 'bible-quantum';

      const bookNames = Object.keys(bookToKJVChapterVerseCounts);
      const randomBookIndex = scaleQrngNumber(randomNums[0], bookNames.length);
      const selectedBookName = bookNames[randomBookIndex];

      const chaptersInBook = bookToKJVChapterVerseCounts[selectedBookName];
      // Ensure chaptersInBook is valid before accessing length
      if (!chaptersInBook || chaptersInBook.length === 0) {
          throw new Error(`No chapter data found for book: ${selectedBookName}`);
      }
      const maxChapters = chaptersInBook.length;

      const randomChapter = scaleQrngNumber(randomNums[1], maxChapters); // 0-indexed for array access
      const versesInChapterCount = chaptersInBook[randomChapter]; // Count of verses for this chapter

      // Ensure versesInChapterCount is valid before accessing
      if (typeof versesInChapterCount === 'undefined' || versesInChapterCount === 0) {
           throw new Error(`No verse count found for chapter ${randomChapter + 1} of book: ${selectedBookName}`);
      }
      const randomVerse = scaleQrngNumber(randomNums[2], versesInChapterCount); // 0-indexed for array access

      // Find the verse in flatKJV
      const foundVerse = flatKJV.find(v =>
        v.book === selectedBookName &&
        v.chapter === (randomChapter + 1) && // Convert back to 1-indexed for comparison
        v.verse === (randomVerse + 1)      // Convert back to 1-indexed for comparison
      );

      if (foundVerse) {
          verseToReturn = {
              book: foundVerse.book,
              chapter: foundVerse.chapter,
              verse: foundVerse.verse,
              text: foundVerse.text
          };
      } else {
          console.error(`Failed to find quantum-selected verse: ${selectedBookName} ${randomChapter+1}:${randomVerse+1}. Falling back to pseudo.`);
          // This should ideally not happen if data is consistent, but as a safeguard:
          mode = 'bible-pseudo';
          const index = Math.floor(Math.random() * numVerses);
          const verseObj = flatKJV[index];
          verseToReturn = {
              book: verseObj.book,
              chapter: verseObj.chapter,
              verse: verseObj.verse,
              text: verseObj.text
          };
      }
    } else {
      // Fallback if quantum numbers were not fully successful (e.g., API failed or not enough numbers)
      console.warn("QRNG not fully successful. Falling back.");
      if (liber) {
        mode = 'liber';
        const sectionKeys = Object.keys(liber);
        // Ensure there are sections in Liber Legis
        if (sectionKeys.length === 0) {
            throw new Error("Liber Legis data is empty or malformed.");
        }
        const randomSectionKey = sectionKeys[Math.floor(Math.random() * sectionKeys.length)];
        const verses = liber[randomSectionKey];
        // Ensure there are verses in the selected Liber Legis section
        if (!verses || verses.length === 0) {
            throw new Error(`Liber Legis section ${randomSectionKey} has no verses.`);
        }
        const vIdx = Math.floor(Math.random() * verses.length);
        verseToReturn = {
          mode: 'liber', // Override mode for Liber
          book: "Liber Legis", // Custom book name for Liber
          chapter: parseInt(randomSectionKey), // Section is treated as chapter
          verse: vIdx + 1,
          text: verses[vIdx]
        };
      } else {
        // Final fallback: pseudo-random Bible verse
        mode = 'bible-pseudo';
        const index = Math.floor(Math.random() * numVerses);
        const verseObj = flatKJV[index];
        verseToReturn = {
          book: verseObj.book,
          chapter: verseObj.chapter,
          verse: verseObj.verse,
          text: verseObj.text
        };
      }
    }
  } catch (err) {
    console.error("Error in /get-verse endpoint:", err);
    // Send a 500 error response if something goes wrong on the server
    return res.status(500).json({ error: "Failed to retrieve verse due to server error.", details: err.message, mode: "error" });
  }

  // Send the response
  res.json({
    mode,
    ...verseToReturn
  });
  console.log(`Sent verse: ${mode} - ${verseToReturn.book || ''} ${verseToReturn.chapter || ''}:${verseToReturn.verse || ''}`);
});

app.listen(PORT, () => console.log(`Spirit-Reader backend running on port ${PORT}`));

// --- Initial QRN Stack Refill ---
// This ensures the stack is populated as soon as the server starts.
refillQuantumStack();

# Krysed — AI Emergency Education Platform

> "Learning Never Stops, Even When the World Does"

## The Story
I was sitting in a taxi when I heard two women talking about how their children stayed home for weeks without studying because of the floods. I'm from Morocco. I went through it myself during COVID. Every year something happens here — earthquake in the south, floods in the north, snow blocking roads in the mountains. And every time, students fall behind through no fault of their own.

I have little siblings who suffered through this. I built Krysed so they never have to again.

## What Krysed Does
Krysed is an AI emergency education platform powered by Gemini 3 Flash. It connects students with their lessons during any crisis — floods, earthquakes, pandemics, power outages.

- **Speaks Darija (Arabic letters), French, and English**
- **Adapts** to the student's crisis situation
- **Structured lessons:** LESSON, IMAGINE THIS, KEY INSIGHT, QUICK CHECK
- **No Power mode** for low battery situations
- **Text to speech**
- **Google Cloud Firestore Integration:** Every conversation is saved to cloud storage with real-time sync, providing persistent history across sessions.

## Tech Stack
- **AI Core:** Gemini 1.5 Flash
- **Cloud Database:** Google Cloud Firestore (Firebase)
- **Frontend:** React + Vite + Tailwind CSS
- **Deployment:** Vercel

## Live Demo
[https://krysed2.vercel.app](https://krysed2.vercel.app)

## Setup & Testing
1. Clone the repo: git clone https://github.com/blue0-008/-krysed2.git
2. Install dependencies: npm install
3. Create .env file in root with: VITE_GEMINI_API_KEY=your_gemini_api_key
4. Get free Gemini API key from: aistudio.google.com/app/apikey
5. Run locally: npm run dev
6. Open: http://localhost:5173
7. Or test live at: https://krysed2.vercel.app

## Built for
**Gemini Live Agent Challenge 2026 — Creative Storyteller Category**

*This is not a TV generation. They deserve better.*

import { useState } from "react";

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI("AIzaSyCESZd68oB5J2RkdawHyDS_5uhGUoMk5GQ");

export default function App() {

  const [messages, setMessages] = useState([]);

  const [input, setInput] = useState("");

  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {

    if (!input.trim()) return;

    const userMessage = { role: "user", text: input };

    setMessages((prev) => [...prev, userMessage]);

    setInput("");

    setLoading(true);

    try {

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const result = await model.generateContent(

        `You are Krysed, an AI tutor helping students in crisis zones like earthquakes and pandemics. Be supportive, clear, and teach in simple language. The student says: ${input}`

      );

      const aiMessage = { role: "ai", text: result.response.text() };

      setMessages((prev) => [...prev, aiMessage]);

    } catch (error) {

      setMessages((prev) => [...prev, { role: "ai", text: "Error: " + error.message }]);

    }

    setLoading(false);

  };

  return (

    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "white", fontFamily: "sans-serif", padding: "20px" }}>

      <h1 style={{ color: "#10b981", textAlign: "center" }}>Krysed</h1>

      <p style={{ textAlign: "center", color: "#888" }}>Learning Never Stops, Even When the World Does</p>

      <div style={{ maxWidth: "600px", margin: "0 auto" }}>

        <div style={{ background: "#111", borderRadius: "12px", padding: "20px", minHeight: "300px", marginBottom: "20px" }}>

          {messages.length === 0 && (

            <p style={{ color: "#555", textAlign: "center" }}>Ask your AI tutor anything...</p>

          )}

          {messages.map((msg, i) => (

            <div key={i} style={{ marginBottom: "12px", textAlign: msg.role === "user" ? "right" : "left" }}>

              <span style={{

                background: msg.role === "user" ? "#10b981" : "#1f1f1f",

                padding: "10px 16px",

                borderRadius: "18px",

                display: "inline-block",

                maxWidth: "80%"

              }}>

                {msg.text}

              </span>

            </div>

          ))}

          {loading && <p style={{ color: "#10b981" }}>Krysed is thinking...</p>}

        </div>

        <div style={{ display: "flex", gap: "10px" }}>

          <input

            value={input}

            onChange={(e) => setInput(e.target.value)}

            onKeyDown={(e) => e.key === "Enter" && sendMessage()}

            placeholder="Ask anything..."

            style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "none", background: "#111", color: "white", fontSize: "16px" }}

          />

          <button

            onClick={sendMessage}

            style={{ background: "#10b981", color: "white", border: "none", padding: "12px 20px", borderRadius: "8px", cursor: "pointer", fontSize: "16px" }}

          >

            Send

          </button>

        </div>

      </div>

    </div>

  );

}
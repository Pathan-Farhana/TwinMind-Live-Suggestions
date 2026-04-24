// import { NextResponse } from "next/server";
// import axios from "axios";

// export async function POST(req: Request) {
//   const body = await req.json();
//   const { transcript, suggestion } = body;
//   const apiKey = process.env.GROQ_API_KEY;

//   try {
//     const response = await axios.post(
//       "https://api.groq.com/openai/v1/chat/completions",
//       {
//         model: "openai/gpt-oss-120b", // use a supported model
//         messages: [
//           { role: "system", content: "You are TwinMind, an AI meeting copilot." },
//           {
//             role: "user",
//             content: `Transcript: ${transcript}\n\nSuggestion: ${suggestion}\n\nExpand this suggestion into a detailed answer.`,
//           },
//         ],
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${apiKey}`,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     const content = response.data?.choices?.[0]?.message?.content;
//     return NextResponse.json({ content });
//   } catch (error: any) {
//     console.error(error.response?.data || error.message);
//     return NextResponse.json({ error: "Failed to fetch chat answer" }, { status: 500 });
//   }
// }


import { NextResponse } from "next/server";
import axios from "axios";

export async function POST(req: Request) {
  const body = await req.json();
  const { transcript, suggestion, groqKey } = body;

  if (!groqKey || !groqKey.trim()) {
    return NextResponse.json({ error: "Groq API key is missing." }, { status: 401 });
  }

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: "You are TwinMind, an AI meeting copilot." },
          {
            role: "user",
            content: `Transcript: ${transcript}\n\nSuggestion: ${suggestion}\n\nExpand this suggestion into a detailed answer.`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${groqKey.trim()}`,
          "Content-Type": "application/json",
        },
      }
    );
    const content = response.data?.choices?.[0]?.message?.content;
    return NextResponse.json({ content });
  } catch (error: any) {
    const status = error.response?.status;
    const message = error.response?.data?.error?.message || error.message;
    if (status === 401) {
      return NextResponse.json({ error: "Invalid Groq API key. Please check and try again." }, { status: 401 });
    }
    console.error("Chat error:", message);
    return NextResponse.json({ error: "Failed to fetch chat answer: " + message }, { status: 500 });
  }
}
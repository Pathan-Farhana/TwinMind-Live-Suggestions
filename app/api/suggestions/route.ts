// import { NextResponse } from "next/server";
// import axios from "axios";

// export async function POST(req: Request) {
//   const body = await req.json();
//   const { transcript } = body;
//   const apiKey = process.env.GROQ_API_KEY;

//   try {
//     const response = await axios.post(
//       "https://api.groq.com/openai/v1/chat/completions",
//       {
//         model: "openai/gpt-oss-120b",
//         messages: [
//           { role: "system", content: "You are TwinMind, an AI meeting copilot." },
//           {
//             role: "user",
//             content: `Transcript: ${transcript}\n\nGenerate exactly 3 suggestions in strict JSON format:
// [
//   { "title": "string", "preview": "string", "fullAnswer": "string" },
//   { "title": "string", "preview": "string", "fullAnswer": "string" },
//   { "title": "string", "preview": "string", "fullAnswer": "string" }
// ]`,
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

//     // Extract only the content string
//     const content = response.data.choices[0].message.content;
//     return NextResponse.json({ content });
//   } catch (error: any) {
//     console.error(error.response?.data || error.message);
//     return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 });
//   }
// }


import { NextResponse } from "next/server";
import axios from "axios";

export async function POST(req: Request) {
  const body = await req.json();
  const { transcript, groqKey } = body;

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
            content: `Transcript: ${transcript}\n\nGenerate exactly 3 suggestions in strict JSON format:
[
  { "title": "string", "preview": "string", "fullAnswer": "string" },
  { "title": "string", "preview": "string", "fullAnswer": "string" },
  { "title": "string", "preview": "string", "fullAnswer": "string" }
]`,
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
    const content = response.data.choices[0].message.content;
    return NextResponse.json({ content });
  } catch (error: any) {
    const status = error.response?.status;
    const message = error.response?.data?.error?.message || error.message;
    if (status === 401) {
      return NextResponse.json({ error: "Invalid Groq API key. Please check and try again." }, { status: 401 });
    }
    console.error("Suggestions error:", message);
    return NextResponse.json({ error: "Failed to fetch suggestions: " + message }, { status: 500 });
  }
}